import { Pressable, Text } from './locale-ui';
import { View } from 'react-native';
import { ChatGptIcon } from './chatgpt-icons';
import { useTheme } from './theme';
import { Copy } from './ui';
import type { Model } from './types';

export function ModelList({
  models,
  selected,
  onSelect,
}: {
  models: Model[];
  selected: string | null;
  onSelect: (model: Model) => void;
}) {
  const { colors: c } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      {models.map((model) => {
        const isSelected = selected === model.id;
        return (
          <Pressable
            key={model.id}
            accessibilityRole="button"
            onPress={() => onSelect(model)}
            style={({ hovered, pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: isSelected
                ? c.selected
                : hovered || pressed
                  ? c.hover
                  : 'transparent',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            })}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text translate={false} style={{ color: c.text, fontSize: 14, fontWeight: '500' }}>
                {model.name}
              </Text>
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
            </View>
            {isSelected && <ChatGptIcon name="check" size={16} color={c.text} />}
          </Pressable>
        );
      })}
    </View>
  );
}
