import { Pressable, Text } from './locale-ui';
import { FoolSpinner } from './fool-spinner';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { ChatGptIcon } from './chatgpt-icons';
import { useTheme } from './theme';
import { useMotionPaused } from './motion';
import type { FileRecord } from './types';

const failures: Record<string, string> = {
  IMAGE_INVALID: 'This photo could not be read. Try a JPG or PNG copy.',
  NO_EXTRACTABLE_TEXT: 'This file has no readable text.',
  FILE_TYPE_MISMATCH: 'The file contents do not match its format.',
  EXTRACTION_FAILED: 'This document could not be read. Try saving a new copy.',
  FILE_SIZE_MISMATCH: 'The upload was incomplete. Try attaching it again.',
};

const LARGE_PHOTO = 280;

const styles = StyleSheet.create({
  largePhoto: { width: LARGE_PHOTO, height: LARGE_PHOTO },
  largeImage: { ...StyleSheet.absoluteFill, width: LARGE_PHOTO, height: LARGE_PHOTO },
});

function PhotoSkeleton({ size }: { size: number }) {
  const { colors: c, isDark } = useTheme();
  const reduced = useMotionPaused();
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    if (Platform.OS === 'web' || reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);

  const webGradient = isDark
    ? 'linear-gradient(110deg, rgba(255,255,255,0.05) 20%, rgba(255,255,255,0.14) 45%, rgba(255,255,255,0.05) 70%)'
    : 'linear-gradient(110deg, rgba(13,13,13,0.05) 20%, rgba(13,13,13,0.12) 45%, rgba(13,13,13,0.05) 70%)';

  return (
    <Animated.View
      testID="attachment-photo-skeleton"
      style={{
        width: size,
        height: size,
        borderRadius: size > 100 ? 16 : 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(13,13,13,0.07)',
        opacity: Platform.OS === 'web' ? 1 : pulse,
        ...(Platform.OS === 'web'
          ? ({
              backgroundImage: webGradient,
              backgroundSize: '220% 100%',
              animation: 'ai-chat-photo-shimmer 1.4s linear infinite',
            } as Record<string, unknown>)
          : {}),
      }}
    >
      <ChatGptIcon name="library" size={size > 100 ? 36 : 16} color={c.subtle} />
    </Animated.View>
  );
}

export function Attachment({
  file,
  id,
  onRemove,
  onOpen,
  compact = false,
  large = false,
}: {
  file?: FileRecord;
  id: string;
  onRemove?: () => void;
  onOpen?: () => void;
  compact?: boolean;
  large?: boolean;
}) {
  const { colors: c } = useTheme();
  const reduced = useMotionPaused();
  const [loaded, setLoaded] = useState(false);
  const shown = useSharedValue(0);
  const markLoaded = useCallback(() => {
    setLoaded(true);
    shown.value = withTiming(1, { duration: reduced ? 0 : 220 });
  }, [reduced, shown]);
  const imageStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
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
  const photoLoading = photo && !failed && (!ready || preview.isLoading || !preview.data);

  if (large && (photo || !file)) {
    return (
      <Pressable
        testID="attachment-card"
        accessibilityRole={onOpen && ready && preview.data ? 'button' : undefined}
        accessibilityLabel={`Open attachment ${file?.filename ?? ''}`}
        onPress={onOpen}
        disabled={!onOpen || !ready || !preview.data}
        style={{
          alignSelf: 'flex-start',
          borderRadius: 16,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.raised,
        }}
      >
        <View style={styles.largePhoto}>
          {!loaded && <PhotoSkeleton size={LARGE_PHOTO} />}
          {preview.data && (
            <Reanimated.Image
              accessibilityLabel={file?.filename ?? 'Attached photo'}
              source={{ uri: preview.data.url }}
              style={[styles.largeImage, imageStyle]}
              resizeMode="cover"
              onLoad={markLoaded}
            />
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <View
      testID="attachment-card"
      style={{
        maxWidth: compact ? 250 : 320,
        borderRadius: 14,
        backgroundColor: c.raised,
        borderWidth: 1,
        borderColor: failed ? c.danger : c.border,
        overflow: 'hidden',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8 }}>
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
              style={{ width: compact ? 40 : 56, height: compact ? 40 : 56, borderRadius: 10 }}
              resizeMode="cover"
            />
          ) : photoLoading ? (
            <PhotoSkeleton size={compact ? 40 : 56} />
          ) : (
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: c.control,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: c.text, fontSize: 11, fontWeight: '700' }}>
                {photo ? 'IMG' : (file?.filename.split('.').pop()?.toUpperCase() ?? 'FILE')}
              </Text>
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              translate={false}
              numberOfLines={1}
              style={{ fontSize: 13, fontWeight: '500', color: c.text }}
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
          <FoolSpinner
            size={22}
            label={file?.status === 'processing' ? 'Reading file' : 'Uploading file'}
          />
        )}
        {onRemove && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove attachment from message"
            onPress={onRemove}
            hitSlop={8}
            style={({ hovered }) => ({
              width: 26,
              height: 26,
              borderRadius: 13,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: hovered ? c.hover : 'transparent',
            })}
          >
            <ChatGptIcon name="close" size={14} color={c.muted} />
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
          {failures[file?.error_code ?? ''] ?? 'Try uploading a new copy of this file.'}
        </Text>
      )}
    </View>
  );
}
