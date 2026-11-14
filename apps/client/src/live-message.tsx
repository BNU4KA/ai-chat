import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ThinkingSkeleton } from './fool-spinner';
import { StreamingMarkdown } from './streaming-markdown';
import { useTheme } from './theme';
import { runQuery } from './use-run';
import type { Snapshot } from './types';

export interface LiveMessageContentProps {
  runId: string | null;
  text: string;
  pending: boolean;
  onCitation?: (id: string) => void;
}

const selectText = (snapshot: Snapshot) => snapshot.assistant_message.content;

export function LiveMessageContent({ runId, text, pending, onCitation }: LiveMessageContentProps) {
  const { colors: c } = useTheme();
  const live = useQuery({
    ...runQuery(runId ?? undefined),
    enabled: false,
    select: selectText,
  }).data;
  const content = pending ? live || text : text;

  if (!content) return pending ? <ThinkingSkeleton /> : null;
  return (
    <View style={styles.content}>
      <StreamingMarkdown text={content} streaming={pending} onCitation={onCitation} />
      {pending && (
        <View testID="streaming-cursor" style={[styles.cursor, { backgroundColor: c.text }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 6 },
  cursor: { width: 10, height: 10, borderRadius: 5 },
});
