import { useEffect } from 'react';
import { Image, Modal, Platform, StyleSheet } from 'react-native';
import { Pressable, Text } from './locale-ui';

export function ImageViewer({
  url,
  name,
  onClose,
}: {
  url: string | null;
  name: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!url || Platform.OS !== 'web') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [url, onClose]);

  return (
    <Modal visible={!!url} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close image"
        onPress={onClose}
        style={styles.backdrop}
      >
        {url ? (
          <Image
            source={{ uri: url }}
            accessibilityLabel={name}
            resizeMode="contain"
            style={styles.image}
          />
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={styles.close}
      >
        <Text style={styles.closeText}>×</Text>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  image: { width: '100%', height: '100%' },
  close: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  closeText: { color: '#ffffff', fontSize: 28, lineHeight: 30 },
});
