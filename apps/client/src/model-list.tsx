import { Pressable, Text } from './locale-ui';
import { View } from 'react-native';
import { useTheme } from './theme';
import { Copy } from './ui';
import type { Model } from './types';

interface ModelListProps {
  models: Model[];
  selected: string | null;
  onSelect: (model: Model) => void;
}

export function ModelList({
  models,
  selected,
  onSelect,
}: ModelListProps) {
  const { colors: c } = useTheme();
  return (
    <View testID="selection-list" style={{ gap: 2 }}>
      {models.map((model) => (
        <Pressable
          key={model.id}
          testID="selection-list-item"
          accessibilityRole="button"
          accessibilityState={{ selected: selected === model.id }}
          onPress={() => onSelect(model)}
          style={({ hovered, pressed }) => ({
            minHeight: 44,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 14,
            backgroundColor:
              selected === model.id ? c.selected : hovered || pressed ? c.hover : 'transparent',
            gap: 4,
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              translate={false}
              style={{ color: c.text, flex: 1, fontSize: 16, fontWeight: '600' }}
            >
              {model.name}
            </Text>
            {selected === model.id ? <Text style={{ color: c.text }}>✓</Text> : null}
          </View>
          <Copy small muted>
            {model.supports_tools ? 'Tools supported' : 'Text chat'}
            {model.supports_images ? ' · Photos' : ''} ·{' '}
            {model.context_length?.toLocaleString() ?? 'Unknown'} {'context'}
          </Copy>
          <Copy small muted>
            Input ${model.input_price_per_million_usd ?? '?'} / Output $
            {model.output_price_per_million_usd ?? '?'} per 1M tokens
            {model.catalog_stale ? ' · Cached catalog' : ''}
          </Copy>
        </Pressable>
      ))}
    </View>
  );
}
