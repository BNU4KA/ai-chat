import { memo, useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Attachment } from './attachment';
import { PassageActions } from './chat-extras';
import { MessageActions } from './message-actions';
import { StreamingMarkdown } from './streaming-markdown';
import { LiveMessageContent } from './live-message';
import { Button, Copy, Field } from './ui';
import { Pressable, Text } from './locale-ui';
import { useTheme } from './theme';
import type { FileRecord, Message } from './types';

const COLLAPSE_CHARS = 700;
const COLLAPSE_LINES = 12;
const COLLAPSED_HEIGHT = 220;

const EDIT_MIN_HEIGHT = 120;
const EDIT_MAX_HEIGHT = 480;

export interface MessageRowProps {
  message: Message;
  files?: FileRecord[];
  highlighted: boolean;
  editing: boolean;
  canRetry: boolean;
  busy: boolean;
  passageOpen: boolean;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onSelectVariant: (messageId: string, variantId: string) => void;
  onSubmitEdit: (id: string, text: string) => Promise<boolean>;
  onRetry: () => void;
  onCitation: (runId: string, citationId: string) => void;
  onTogglePassage: (id: string) => void;
  onClosePassage: () => void;
  onSaveDocument: (text: string) => void;
  onDraft: (text: string) => void;
  onOpenFile: (fileId: string) => void;
  onHighlightLayout: (y: number) => void;
  onError: (error: unknown) => void;
}

const ENTERING = FadeInDown.duration(220);
const LAYOUT = LinearTransition.duration(200);
const EDIT_ENTERING = FadeIn.duration(160);

function MessageRowView({
  message,
  files,
  highlighted,
  editing,
  canRetry,
  busy,
  passageOpen,
  onStartEdit,
  onCancelEdit,
  onSelectVariant,
  onSubmitEdit,
  onRetry,
  onCitation,
  onTogglePassage,
  onClosePassage,
  onSaveDocument,
  onDraft,
  onOpenFile,
  onHighlightLayout,
  onError,
}: MessageRowProps) {
  const { colors: c } = useTheme();
  const [draft, setDraft] = useState(message.content);
  const [saving, setSaving] = useState(false);
  const editField = useRef<ComponentRef<typeof Field>>(null);
  const [fieldHeight, setFieldHeight] = useState(EDIT_MIN_HEIGHT);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!editing || Platform.OS !== 'web') return;
    const element = editField.current as unknown as HTMLTextAreaElement | null;
    element?.setSelectionRange?.(element.value.length, element.value.length);
  }, [editing]);
  const isUser = message.role === 'user';
  const collapsible =
    isUser &&
    (message.content.length > COLLAPSE_CHARS ||
      message.content.split('\n').length > COLLAPSE_LINES);
  const pending = message.status === 'pending';
  const finished = !isUser && !pending && !!message.content;
  const runId = message.run_id;

  const startEdit = useCallback(() => {
    setDraft(message.content);
    onStartEdit(message.id);
  }, [message.content, message.id, onStartEdit]);
  const submitEdit = useCallback(() => {
    setSaving(true);
    void onSubmitEdit(message.id, draft.trim()).finally(() => setSaving(false));
  }, [draft, message.id, onSubmitEdit]);
  const citation = useCallback(
    (citationId: string) => {
      if (runId) onCitation(runId, citationId);
    },
    [onCitation, runId],
  );
  const togglePassage = useCallback(() => onTogglePassage(message.id), [message.id, onTogglePassage]);
  const saveDocument = useCallback(
    () => onSaveDocument(message.content),
    [message.content, onSaveDocument],
  );
  const layout = useCallback(
    (event: LayoutChangeEvent) => {
      if (highlighted) onHighlightLayout(event.nativeEvent.layout.y);
    },
    [highlighted, onHighlightLayout],
  );

  return (
    <Animated.View
      testID="chat-message"
      entering={ENTERING}
      layout={LAYOUT}
      onLayout={layout}
      style={[
        isUser ? (editing ? styles.userEditing : styles.user) : styles.assistant,
        highlighted && [styles.highlighted, { borderColor: c.info }],
      ]}
    >
      {editing ? (
        <Animated.View
          entering={EDIT_ENTERING}
          style={[styles.editBox, { backgroundColor: c.userBubble }]}
        >
          <Field
            ref={editField}
            accessibilityLabel="Edited message"
            multiline
            autoFocus
            value={draft}
            onChangeText={setDraft}
            onContentSizeChange={(event) =>
              setFieldHeight(
                Math.min(
                  EDIT_MAX_HEIGHT,
                  Math.max(EDIT_MIN_HEIGHT, Math.ceil(event.nativeEvent.contentSize.height) + 16),
                ),
              )
            }
            scrollEnabled={fieldHeight >= EDIT_MAX_HEIGHT}
            style={[styles.editField, { height: fieldHeight }]}
          />
          <View style={styles.editFooter}>
            <Copy small muted>
              Your edit keeps the earlier answers; switch versions with the arrows.
            </Copy>
            <View style={styles.editButtons}>
              <Button secondary onPress={onCancelEdit}>
                Cancel
              </Button>
              <Button disabled={busy || saving || !draft.trim()} onPress={submitEdit}>
                Save & regenerate
              </Button>
            </View>
          </View>
        </Animated.View>
      ) : (
        <View
          testID={isUser ? 'user-message-bubble' : 'assistant-message-body'}
          style={isUser ? [styles.bubble, { backgroundColor: c.userBubble }] : styles.body}
        >
          {isUser ? (
            !!message.content && (
              <View style={styles.content}>
                <View style={collapsible && !expanded ? styles.collapsed : undefined}>
                  <StreamingMarkdown text={message.content} streaming={false} />
                </View>
                {collapsible && (
                  <Pressable
                    testID="message-expand"
                    accessibilityRole="button"
                    accessibilityLabel={expanded ? 'Show less of this message' : 'Show the full message'}
                    onPress={() => setExpanded((value) => !value)}
                    style={({ hovered, pressed }) => [
                      styles.expandButton,
                      { backgroundColor: hovered || pressed ? c.hover : 'transparent' },
                    ]}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '500', color: c.info }}>
                      {expanded ? 'Show less' : 'Show more'}
                    </Text>
                  </Pressable>
                )}
              </View>
            )
          ) : (
            <LiveMessageContent
              runId={runId}
              text={message.content}
              pending={pending}
              onCitation={runId ? citation : undefined}
            />
          )}
          {message.file_ids.map((fileId) => (
            <Attachment
              key={fileId}
              id={fileId}
              large={!isUser}
              file={files?.find((file) => file.id === fileId)}
              onOpen={() => onOpenFile(fileId)}
            />
          ))}
          {['partial', 'failed', 'cancelled'].includes(message.status) && (
            <Copy small muted>
              {message.status === 'cancelled'
                ? 'Cancelled — partial response'
                : message.status === 'failed'
                  ? 'Response failed'
                  : 'Incomplete response'}
            </Copy>
          )}
        </View>
      )}

      {isUser && message.branch && !editing && (
        <View testID="branch-switcher" style={styles.branchSwitcher}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous version"
            disabled={message.branch.index <= 1}
            onPress={() =>
              onSelectVariant(message.id, message.branch!.message_ids[message.branch!.index - 2]!)
            }
            style={({ hovered, pressed }) => [
              styles.branchButton,
              { backgroundColor: hovered || pressed ? c.hover : 'transparent' },
              message.branch!.index <= 1 && { opacity: 0.35 },
            ]}
          >
            <Text style={{ fontSize: 18, color: c.muted }}>‹</Text>
          </Pressable>
          <Text testID="branch-position" style={{ fontSize: 13, color: c.muted }}>
            {message.branch.index}/{message.branch.count}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next version"
            disabled={message.branch.index >= message.branch.count}
            onPress={() =>
              onSelectVariant(message.id, message.branch!.message_ids[message.branch!.index]!)
            }
            style={({ hovered, pressed }) => [
              styles.branchButton,
              { backgroundColor: hovered || pressed ? c.hover : 'transparent' },
              message.branch!.index >= message.branch!.count && { opacity: 0.35 },
            ]}
          >
            <Text style={{ fontSize: 18, color: c.muted }}>›</Text>
          </Pressable>
        </View>
      )}
      {!editing && (message.content || (!isUser && !pending)) && (
        <MessageActions
          text={message.content}
          assistant={!isUser}
          canRetry={canRetry}
          busy={busy}
          onRetry={onRetry}
          onEdit={isUser ? startEdit : undefined}
          onWorkWithResponse={finished ? togglePassage : undefined}
          onSaveDocument={finished ? saveDocument : undefined}
          onError={onError}
        />
      )}
      {finished && (
        <PassageActions
          text={message.content}
          open={passageOpen}
          onClose={onClosePassage}
          onDraft={onDraft}
        />
      )}
    </Animated.View>
  );
}

export const MessageRow = memo(MessageRowView);

const styles = StyleSheet.create({
  user: { alignSelf: 'flex-end', maxWidth: '78%', gap: 6 },
  userEditing: { alignSelf: 'stretch', maxWidth: '100%', gap: 6 },
  assistant: { alignSelf: 'stretch', maxWidth: '100%', gap: 6 },
  highlighted: { paddingLeft: 10, borderLeftWidth: 3 },
  editBox: { padding: 14, borderRadius: 20, gap: 10 },
  collapsed: { maxHeight: COLLAPSED_HEIGHT, overflow: 'hidden' },
  expandButton: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 18,
  },
  branchSwitcher: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 2 },
  branchButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  editField: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    minHeight: 44,
    paddingHorizontal: 4,
    paddingVertical: 2,
    outlineWidth: 0,
  },
  editFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  editButtons: { flexDirection: 'row', gap: 8 },
  bubble: { gap: 10, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 22 },
  body: { gap: 10 },
  content: { gap: 6 },
});
