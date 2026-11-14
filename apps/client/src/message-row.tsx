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
import { useTheme } from './theme';
import type { FileRecord, Message } from './types';

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

  useEffect(() => {
    if (!editing || Platform.OS !== 'web') return;
    const element = editField.current as unknown as HTMLTextAreaElement | null;
    element?.setSelectionRange?.(element.value.length, element.value.length);
  }, [editing]);
  const isUser = message.role === 'user';
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
            style={styles.editField}
          />
          <View style={styles.editFooter}>
            <Copy small muted>
              Later messages will be replaced by a new answer.
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
                <StreamingMarkdown text={message.content} streaming={false} />
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
