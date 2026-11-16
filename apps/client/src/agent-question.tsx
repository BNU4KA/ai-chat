import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { api, json } from './api';
import { Pressable, Text } from './locale-ui';
import { useTheme } from './theme';
import type { AgentQuestionItem } from './types';
import { Button, Copy, ErrorNotice, Field } from './ui';

type Choice = { kind: 'option'; index: number } | { kind: 'custom'; text: string };

function customText(choice: Choice | undefined): string {
  return choice?.kind === 'custom' ? choice.text : '';
}

// Shown above the composer. Questions are asked one at a time; the answers are sent together at the end.
export function AgentQuestionDock({ question }: { question: AgentQuestionItem }) {
  const cache = useQueryClient();
  const { colors: c } = useTheme();
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState<Record<string, Choice | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const total = question.questions.length;
  const item = question.questions[Math.min(step, total - 1)]!;
  const choice = choices[item.id];
  const answeredCurrent =
    choice?.kind === 'option' || (choice?.kind === 'custom' && choice.text.trim().length > 0);
  const last = step >= total - 1;

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

  function submit() {
    void send({
      answers: question.questions.map((entry) => {
        const picked = choices[entry.id];
        if (picked?.kind === 'option') return { question_id: entry.id, option_index: picked.index };
        return { question_id: entry.id, custom_text: customText(picked).trim() };
      }),
    });
  }

  return (
    <View
      testID="agent-question-dock"
      accessibilityLabel="Question from the assistant"
      style={{
        gap: 10,
        padding: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.raised,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Copy small muted>
          The assistant needs your choice
        </Copy>
        <Text style={{ fontSize: 12, color: c.muted }}>
          {Math.min(step + 1, total)} / {total}
        </Text>
      </View>
      <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }}>{item.text}</Text>
      {item.options.map((option, index) => {
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
          value={customText(choice)}
          onChangeText={(text) => setChoices((old) => ({ ...old, [item.id]: { kind: 'custom', text } }))}
          editable={!busy}
          maxLength={1000}
        />
      )}
      <ErrorNotice error={error} />
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
        <Button secondary disabled={busy} onPress={() => void send({ skip: true })}>
          Skip
        </Button>
        {last ? (
          <Button
            disabled={busy || question.questions.some((entry) => !isAnswered(choices[entry.id]))}
            onPress={submit}
          >
            Answer
          </Button>
        ) : (
          <Button disabled={busy || !answeredCurrent} onPress={() => setStep((value) => value + 1)}>
            Next
          </Button>
        )}
      </View>
    </View>
  );
}

function isAnswered(choice: Choice | undefined): boolean {
  return choice?.kind === 'option' || (choice?.kind === 'custom' && choice.text.trim().length > 0);
}
