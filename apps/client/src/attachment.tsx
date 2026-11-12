import { Pressable, Text } from './locale-ui';
import { Image, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { ActivityMark } from './skeleton';
import { useTheme } from './theme';
import type { FileRecord } from './types';
const failures: Record<string, string> = {
  IMAGE_INVALID: 'This photo could not be read. Try a JPG or PNG copy.',
  NO_EXTRACTABLE_TEXT: 'This file has no readable text.',
  FILE_TYPE_MISMATCH: 'The file contents do not match its format.',
  EXTRACTION_FAILED: 'This document could not be read. Try saving a new copy.',
  FILE_SIZE_MISMATCH: 'The upload was incomplete. Try attaching it again.',
};
export function Attachment({
  file,
  id,
  onRemove,
  onOpen,
  compact = false,
}: {
  file?: FileRecord;
  id: string;
  onRemove?: () => void;
  onOpen?: () => void;
  compact?: boolean;
}) {
  const { colors: c } = useTheme();
  const photo = !!file?.detected_mime?.startsWith('image/');
  const preview = useQuery({
    queryKey: ['attachment-preview', id],
    queryFn: () => api<{ url: string }>(`/v1/files/${id}/download`),
    enabled: photo && file?.status === 'ready',
    staleTime: 240000,
    refetchInterval: 240000,
  });
  const ready = file?.status === 'ready';
  const failed = file?.status === 'failed';
  return (
    <View
      testID="attachment-card"
      style={{
        maxWidth: compact ? 260 : 320,
        borderRadius: 16,
        backgroundColor: c.control,
        borderWidth: 1,
        borderColor: failed ? c.danger : c.border,
        overflow: 'hidden',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }}>
        <Pressable
          accessibilityRole={onOpen ? 'button' : undefined}
          accessibilityLabel={`Open attachment ${file?.filename ?? ''}`}
          onPress={onOpen}
          disabled={!onOpen || !ready}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
        >
          {photo && preview.data ? (
            <Image
              accessibilityLabel={file?.filename ?? 'Attached photo'}
              source={{ uri: preview.data.url }}
              style={{ width: compact ? 42 : 64, height: compact ? 42 : 64, borderRadius: 10 }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                backgroundColor: c.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>
                {photo ? 'IMG' : (file?.filename.split('.').pop()?.toUpperCase() ?? 'FILE')}
              </Text>
            </View>
          )}
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              translate={false}
              numberOfLines={1}
              style={{ fontSize: 14, fontWeight: '500', color: c.text }}
            >
              {file?.filename ?? 'Preparing attachment…'}
            </Text>
            <Text style={{ fontSize: 12, color: failed ? c.danger : c.muted }}>
              {failed
                ? 'Could not read file'
                : ready
                  ? photo
                    ? 'Photo'
                    : 'Document'
                  : file?.status === 'processing'
                    ? 'Reading file…'
                    : 'Uploading…'}
            </Text>
          </View>
        </Pressable>
        {!ready && !failed && (
          <ActivityMark
            label={file?.status === 'processing' ? 'Reading file' : 'Uploading file'}
          />
        )}
        {onRemove && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove attachment from message"
            onPress={onRemove}
            hitSlop={8}
            style={{ padding: 6 }}
          >
            <Text style={{ fontSize: 18, color: c.muted }}>×</Text>
          </Pressable>
        )}
      </View>
      {failed && (
        <Text
          accessibilityRole="alert"
          style={{
            color: c.danger,
            fontSize: 12,
            lineHeight: 18,
            paddingHorizontal: 10,
            paddingBottom: 10,
          }}
        >
          {failures[file.error_code ?? ''] ?? 'Try uploading a new copy of this file.'}
        </Text>
      )}
    </View>
  );
}
