import { useState } from 'react';
import { View } from 'react-native';
import { Dialog } from './dialog';
import { Pressable, Text } from './locale-ui';
import { useTheme } from './theme';

export type ReasoningEffort = 'low' | 'medium' | 'high';

const labels: Record<ReasoningEffort, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export function ReasoningEffortButton({
  efforts,
  value,
  wide,
  onSelect,
}: {
  efforts: ReasoningEffort[];
  value: ReasoningEffort | null;
  wide: boolean;
  onSelect: (value: ReasoningEffort | null) => void;
}) {
  const { colors: c } = useTheme();
  const [open, setOpen] = useState(false);
  const options: (ReasoningEffort | null)[] = [null, ...efforts];
  const choose = (next: ReasoningEffort | null) => {
    setOpen(false);
    if (next !== value) onSelect(next);
  };
  return (
    <>
      <Pressable
        testID="reasoning-effort-button"
        accessibilityRole="button"
        accessibilityLabel={`Reasoning effort: ${value ? labels[value] : 'Default'}`}
        onPress={() => setOpen(true)}
        style={({ hovered, pressed }) => ({
          height: 34,
          minWidth: wide ? undefined : 34,
          maxWidth: wide ? 160 : 96,
          paddingHorizontal: 10,
          borderRadius: 17,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: value ? c.infoSoft : hovered || pressed ? c.hover : 'transparent',
        })}
      >
        <Text
          numberOfLines={1}
          style={{ fontSize: 13, fontWeight: '500', color: value ? c.info : c.muted }}
        >
          {value ? labels[value] : 'Effort'}
        </Text>
      </Pressable>
      <Dialog title="Reasoning effort" visible={open} close={() => setOpen(false)}>
        <View style={{ gap: 4 }}>
          {options.map((option) => {
            const selected = option === value;
            return (
              <Pressable
                key={option ?? 'default'}
                testID={`reasoning-effort-${option ?? 'default'}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={option ? labels[option] : 'Default'}
                onPress={() => choose(option)}
                style={({ hovered, pressed }) => ({
                  minHeight: 44,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  justifyContent: 'center',
                  backgroundColor: selected ? c.selected : hovered || pressed ? c.hover : 'transparent',
                })}
              >
                <Text style={{ fontSize: 15, color: c.text, fontWeight: selected ? '600' : '400' }}>
                  {option ? labels[option] : 'Default (provider setting)'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Dialog>
    </>
  );
}
