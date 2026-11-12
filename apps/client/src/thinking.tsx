import { useState } from 'react';
import { View } from 'react-native';
import { Pressable, Text } from './locale-ui';
import { FoolSpinner } from './fool-spinner';
import { useTheme } from './theme';
import type { ToolCall } from './types';

interface ThinkingTraceProps {
  running: boolean;
  tools: ToolCall[];
  startedAt?: string;
  finishedAt?: string | null;
}

export function ThinkingTrace({ running, tools, startedAt, finishedAt }: ThinkingTraceProps) {
  const { colors: c } = useTheme();
  const [open, setOpen] = useState(false);
  if (!running && !tools.length) return null;
  const seconds =
    !running && startedAt && finishedAt
      ? Math.max(
          1,
          Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000),
        )
      : null;
  return (
    <View testID="thinking-trace" style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={running ? 'Thinking…' : 'Thought'}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
      >
        {running ? (
          <FoolSpinner size={22} label="Thinking…" />
        ) : (
          <Text style={{ color: c.muted, fontSize: 13 }}>{open ? '▾' : '▸'}</Text>
        )}
        <Text
          testID={running ? 'thinking-label' : undefined}
          style={{ fontSize: 14, fontWeight: '600', color: running ? c.text : c.muted }}
        >
          {running ? 'Thinking…' : 'Thought'}
        </Text>
        {seconds !== null && (
          <Text translate={false} style={{ fontSize: 13, color: c.muted }}>
            {seconds}s
          </Text>
        )}
      </Pressable>
      {open &&
        tools.map((tool) => (
          <View key={tool.id} style={{ paddingLeft: 18, gap: 2 }}>
            <Text translate={false} style={{ fontSize: 13, lineHeight: 18, color: c.muted }}>
              {tool.name.replaceAll('_', ' ')} · {tool.status}
            </Text>
            {tool.status === 'unknown' && (
              <Text style={{ fontSize: 12, lineHeight: 16, color: c.muted }}>
                Outcome unconfirmed. Check the provider before trying again.
              </Text>
            )}
          </View>
        ))}
    </View>
  );
}
