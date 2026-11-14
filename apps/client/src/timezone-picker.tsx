import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './locale-ui';
import { useTheme } from './theme';
import { Field } from './ui';

const FALLBACK_ZONES = [
  'UTC',
  'Europe/London',
  'Europe/Warsaw',
  'Europe/Berlin',
  'Europe/Moscow',
  'Europe/Kyiv',
  'Asia/Dubai',
  'Asia/Almaty',
  'Asia/Novosibirsk',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

function deviceZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function allZones() {
  const supported =
    typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
      ? (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf(
          'timeZone',
        )
      : FALLBACK_ZONES;
  const device = deviceZone();
  return Array.from(new Set([device, ...supported])).sort((a, b) => a.localeCompare(b));
}

export function deviceTimezone() {
  return deviceZone();
}

export function TimezonePickerModal({
  visible,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: string;
  onSelect: (zone: string) => void;
  onClose: () => void;
}) {
  const { colors: c, isDark } = useTheme();
  const [query, setQuery] = useState('');
  const [bodyReady, setBodyReady] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const zones = useMemo(() => allZones(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return zones.slice(0, 80);
    return zones.filter((z) => z.toLowerCase().includes(q)).slice(0, 80);
  }, [zones, query]);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setBodyReady(false);
      opacity.setValue(0);
      translateY.setValue(12);
      return;
    }
    setBodyReady(false);
    opacity.setValue(0);
    translateY.setValue(12);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    const t = setTimeout(() => setBodyReady(true), 120);
    return () => clearTimeout(t);
  }, [visible, opacity, translateY]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close timezone picker"
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
      />
      <Animated.View
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          top: '18%',
          maxHeight: '64%',
          borderRadius: 16,
          backgroundColor: c.raised,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.border,
          overflow: 'hidden',
          padding: 14,
          gap: 10,
          opacity,
          transform: [{ translateY }],
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: '600', color: c.text }}>Calendar timezone</Text>
        {bodyReady ? (
          <>
            <Field
              accessibilityLabel="Search timezones"
              placeholder="Search timezones"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <ScrollView keyboardShouldPersistTaps="handled">
              {filtered.map((zone) => {
                const selected = zone === value;
                return (
                  <Pressable
                    key={zone}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      onSelect(zone);
                      onClose();
                    }}
                    style={({ pressed }) => ({
                      paddingVertical: 12,
                      paddingHorizontal: 10,
                      borderRadius: 10,
                      backgroundColor: selected
                        ? c.selected
                        : pressed
                          ? c.hover
                          : 'transparent',
                    })}
                  >
                    <Text
                      style={{ fontSize: 14, color: c.text, fontWeight: selected ? '600' : '400' }}
                    >
                      {zone}
                      {zone === deviceZone() ? ' · Device' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : (
          <View style={{ gap: 10, paddingVertical: 8 }}>
            {[0.7, 0.95, 0.85, 0.9, 0.65].map((w, i) => (
              <View
                key={i}
                testID="timezone-skeleton-line"
                style={{
                  height: 14,
                  width: `${w * 100}%`,
                  borderRadius: 7,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(13,13,13,0.08)',
                }}
              />
            ))}
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}
