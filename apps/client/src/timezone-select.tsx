import { createElement, useMemo, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useLocale } from './locale';
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

export function TimezoneSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useLocale();
  const { colors: c } = useTheme();
  const zones = useMemo(() => zoneNames(value), [value]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const shown = zones.filter((zone) => zone.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 40);
  if (Platform.OS === 'web') {
    return (
      <View style={{ gap: 6 }}>
        <Copy small>{label}</Copy>
        {createElement(
          'select',
          {
            'aria-label': t(label),
            value: value || 'UTC',
            onChange: (event: { target: { value: string } }) => onChange(event.target.value),
            style: {
              minHeight: 40,
              width: '100%',
              borderRadius: 10,
              border: `1px solid ${c.border}`,
              backgroundColor: c.background,
              color: c.text,
              fontSize: 14,
              padding: '8px 12px',
            },
          },
          zones.map((zone) => createElement('option', { key: zone, value: zone }, zone)),
        )}
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Copy small>{label}</Copy>
      <Button secondary label={label} onPress={() => setOpen(true)}>
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
        <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 6 }}>
          {shown.map((zone) => (
            <Button
              key={zone}
              secondary={zone !== value}
              onPress={() => {
                onChange(zone);
                setOpen(false);
              }}
            >
              {zone}
            </Button>
          ))}
        </ScrollView>
      </Dialog>
    </View>
  );
}
