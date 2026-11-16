import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { api, json } from './api';
import { Pressable, Text } from './locale-ui';
import { useTheme } from './theme';
import type { AgentQuestionItem } from './types';
import { Button, Copy, ErrorNotice, Field, Panel } from './ui';

type Choice = { kind: 'option'; index: number } | { kind: 'custom'; text: string };

function customText(choice: Choice | undefined): string {
  return choice?.kind === 'custom' ? choice.text : '';
}

export function AgentQuestionCard({ question }: { question: AgentQuestionItem }) {
  const cache = useQueryClient();
  const { colors: c } = useTheme();
  const [choices, setChoices] = useState<Record<string, Choice | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const answered = question.questions.every((item) => {
    const choice = choices[item.id];
    if (!choice) return false;
    return choice.kind === 'option' || choice.text.trim().length > 0;
  });

  async function send(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/questions/${question.id}/answer`, json('POST', body));
      await cache.invalidateQueries({ queryKey: ['run'] });
      await cache.invalidateQueries({ queryKey: ['messages'] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <Copy small muted>
        The assistant needs your choice before it continues.
      </Copy>
      {question.questions.map((item) => (
        <View key={item.id} style={{ gap: 6 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }}>{item.text}</Text>
          {item.options.map((option, index) => {
            const choice = choices[item.id];
            const selected = choice?.kind === 'option' && choice.index === index;
            return (
              <Pressable
                key={option.label}
                testID="agent-question-option"
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled: busy }}
                accessibilityLabel={option.label}
                disabled={busy}
                onPress={() => setChoices((old) => ({ ...old, [item.id]: { kind: 'option', index } }))}
                style={({ hovered, pressed }) => ({
                  minHeight: 44,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: selected ? c.info : c.border,
                  backgroundColor: selected ? c.infoSoft : hovered || pressed ? c.hover : 'transparent',
                  justifyContent: 'center',
                })}
              >
                <Text style={{ fontSize: 14, color: c.text }}>{option.label}</Text>
                {option.description ? (
                  <Text style={{ fontSize: 12, color: c.muted }}>{option.description}</Text>
                ) : null}
              </Pressable>
            );
          })}
          {item.allow_custom && (
            <Field
              accessibilityLabel={`Your own answer to ${item.text}`}
              placeholder="Or write your own answer"
              value={customText(choices[item.id])}
              onChangeText={(text) =>
                setChoices((old) => ({ ...old, [item.id]: { kind: 'custom', text } }))
              }
              editable={!busy}
              maxLength={1000}
            />
          )}
        </View>
      ))}
      <ErrorNotice error={error} />
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
        <Button secondary disabled={busy} onPress={() => void send({ skip: true })}>
          Skip
        </Button>
        <Button
          disabled={busy || !answered}
          onPress={() =>
            void send({
              answers: question.questions.map((item) => {
                const choice = choices[item.id];
                if (choice?.kind === 'option') return { question_id: item.id, option_index: choice.index };
                return { question_id: item.id, custom_text: customText(choice).trim() };
              }),
            })
          }
        >
          Answer
        </Button>
      </View>
    </Panel>
  );
}
