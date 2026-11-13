import { Pressable, Text } from './locale-ui';
import { StyleSheet, View } from 'react-native';
import { ChatGptIcon } from './chatgpt-icons';
import { useTheme } from './theme';
import { Copy } from './ui';
import type { Model } from './types';

const POPULAR_GROUPS: {
  provider: string;
  preferred: string[];
  fallback: (m: Model) => boolean;
}[] = [
  {
    provider: 'Google',
    preferred: [
      'google/gemini-2.5-flash',
      'google/gemini-3.8-flash',
      'google/gemini-2.0-flash-001',
      'google/gemini-2.5-flash-lite',
    ],
    fallback: (m) => /^google\/gemini-.*flash/i.test(m.id) && !m.id.includes(':free'),
  },
  {
    provider: 'OpenAI',
    preferred: ['openai/gpt-5-mini', 'openai/gpt-4.1-mini', 'openai/gpt-4o-mini', 'openai/gpt-5-nano'],
    fallback: (m) => /^openai\/gpt-.*mini/i.test(m.id) && !m.id.includes(':free'),
  },
  {
    provider: 'Anthropic',
    preferred: [
      'anthropic/claude-haiku-4.5',
      'anthropic/claude-3.5-haiku',
      'anthropic/claude-3-5-haiku',
      'anthropic/claude-3.5-haiku-20241022',
    ],
    fallback: (m) => /^anthropic\/claude-.*haiku/i.test(m.id) && !m.id.includes(':free'),
  },
];

export function pickPopularModels(models: Model[]): Model[] {
  const picks: Model[] = [];
  for (const group of POPULAR_GROUPS) {
    let found: Model | undefined;
    for (const id of group.preferred) {
      found = models.find((m) => m.id.toLowerCase() === id);
      if (found) break;
    }
    if (!found) {
      found = models.find((m) => group.fallback(m) && m.supports_tools) ?? models.find(group.fallback);
    }
    if (found) picks.push(found);
  }
  return picks;
}

function ModelRow({
  model,
  selected,
  onSelect,
}: {
  model: Model;
  selected: boolean;
  onSelect: (model: Model) => void;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onSelect(model)}
      style={({ hovered, pressed }) => ({
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: selected ? c.selected : hovered || pressed ? c.hover : 'transparent',
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
      {selected && <ChatGptIcon name="check" size={16} color={c.text} />}
    </Pressable>
  );
}

export function ModelList({
  models,
  selected,
  onSelect,
  showPopular = false,
}: {
  models: Model[];
  selected: string | null;
  onSelect: (model: Model) => void;
  showPopular?: boolean;
}) {
  const { colors: c } = useTheme();
  const popular = showPopular ? pickPopularModels(models) : [];
  const popularIds = new Set(popular.map((m) => m.id));
  const rest = (popular.length ? models.filter((m) => !popularIds.has(m.id)) : models).slice(
    0,
    60,
  );

  return (
    <View style={{ gap: 4 }}>
      {!!popular.length && (
        <View style={{ gap: 4, marginBottom: 4 }}>
          <Text
            style={{
              color: c.subtle,
              fontSize: 12,
              fontWeight: '600',
              paddingHorizontal: 12,
              paddingTop: 4,
              paddingBottom: 2,
            }}
          >
            Popular
          </Text>
          {popular.map((model) => (
            <ModelRow
              key={model.id}
              model={model}
              selected={selected === model.id}
              onSelect={onSelect}
            />
          ))}
          {!!rest.length && (
            <>
              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: c.borderSubtle,
                  marginVertical: 6,
                  marginHorizontal: 8,
                }}
              />
              <Text
                style={{
                  color: c.subtle,
                  fontSize: 12,
                  fontWeight: '600',
                  paddingHorizontal: 12,
                  paddingBottom: 2,
                }}
              >
                All models
              </Text>
            </>
          )}
        </View>
      )}
      {rest.map((model) => (
        <ModelRow
          key={model.id}
          model={model}
          selected={selected === model.id}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}
