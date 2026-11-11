import type { ModelAdapter, ModelRequest } from './types.ts';

export type ScriptRound =
  | { text: string }
  | { text?: string; calls: { name: string; arguments: unknown }[] }
  | { error: { code: string; message: string; submitted: boolean } };

export function scriptedModel(rounds: ScriptRound[]): ModelAdapter {
  const pending = [...rounds];
  return {
    async complete(request: ModelRequest) {
      const round = pending.shift();
      if (!round) {
        return {
          text: '',
          toolCalls: [],
          usage: emptyUsage(),
          generationId: null,
          submitted: true,
        };
      }
      if ('error' in round) {
        const error = new Error(round.error.message) as Error & { code: string; submitted: boolean };
        error.code = round.error.code;
        error.submitted = round.error.submitted;
        throw error;
      }
      const text = round.text ?? '';
      if (text) await request.onDelta(text);
      const calls = 'calls' in round ? round.calls : [];
      return {
        text,
        toolCalls: calls.map((call, index) => ({
          id: `call_${request.modelCalls}_${index}`,
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        })),
        usage: emptyUsage(),
        generationId: 'scripted',
        submitted: true,
      };
    },
  };
}

function emptyUsage() {
  return {
    input_tokens: 1,
    output_tokens: 1,
    cost_usd: null,
    cost_status: 'unknown' as const,
  };
}
