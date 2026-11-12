import { Pressable, Text } from './locale-ui';
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
    <>
      {models.map((model) => (
        <Pressable
          key={model.id}
          accessibilityRole="button"
          onPress={() => onSelect(model)}
          style={{
            padding: 14,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: selected === model.id ? c.accent : c.border,
            backgroundColor: selected === model.id ? c.raised : c.surface,
            gap: 4,
          }}
        >
          <Text translate={false} style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>
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
        </Pressable>
      ))}
    </>
  );
}
