import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Pressable, Text } from './locale-ui';
import { useTheme } from './theme';
import { Dialog } from './dialog';
import { Button, Copy, Field } from './ui';

function zoneNames(current: string) {
  const all =
    typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
      ? Intl.supportedValuesOf('timeZone')
      : ['UTC', 'Europe/Moscow', 'Europe/Warsaw', 'America/New_York', 'Asia/Tokyo'];
  return current && !all.includes(current) ? [current, ...all] : all;
}

interface TimezoneSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function TimezoneSelect({ label, value, onChange }: TimezoneSelectProps) {
  const { colors: c } = useTheme();
  const zones = useMemo(() => zoneNames(value), [value]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const shown = zones
    .filter((zone) => zone.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 40);
  return (
    <View style={{ gap: 6 }}>
      <Copy small>{label}</Copy>
      <Button
        secondary
        label={label}
        onPress={() => {
          setQuery('');
          setOpen(true);
        }}
      >
        {value || 'UTC'}
      </Button>
      <Dialog title={label} visible={open} close={() => setOpen(false)}>
        <Field
          accessibilityLabel="Search timezones"
          placeholder="Search timezones"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <ScrollView
          testID="selection-list"
          style={{ maxHeight: 320 }}
          contentContainerStyle={{ gap: 2 }}
          keyboardShouldPersistTaps="handled"
        >
          {shown.map((zone) => {
            const selected = zone === value;
            return (
              <Pressable
                key={zone}
                testID="selection-list-item"
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  onChange(zone);
                  setOpen(false);
                }}
                style={({ hovered, pressed }) => ({
                  minHeight: 44,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: selected
                    ? c.selected
                    : hovered || pressed
                      ? c.hover
                      : 'transparent',
                })}
              >
                <Text translate={false} style={{ color: c.text, flex: 1, fontSize: 14 }}>
                  {zone}
                </Text>
                {selected ? <Text style={{ color: c.text }}>✓</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </Dialog>
    </View>
  );
}
