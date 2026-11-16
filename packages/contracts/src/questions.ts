import { z } from 'zod';

export const agentQuestionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
    text: z.string().trim().min(1).max(300),
    options: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(80),
            description: z.string().trim().max(160).optional(),
          })
          .strict(),
      )
      .min(2)
      .max(4),
    allow_custom: z.boolean().default(true),
  })
  .strict();

export const askUserArgsSchema = z
  .object({ questions: z.array(agentQuestionSchema).min(1).max(3) })
  .strict()
  .refine((value) => new Set(value.questions.map((question) => question.id)).size === value.questions.length, {
    message: 'Question ids must be unique',
  });

export const answerQuestionSchema = z.union([
  z.object({ skip: z.literal(true) }).strict(),
  z
    .object({
      answers: z
        .array(
          z
            .object({
              question_id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
              option_index: z.number().int().min(0).max(3).optional(),
              custom_text: z.string().trim().min(1).max(1000).optional(),
            })
            .strict(),
        )
        .min(1)
        .max(3),
    })
    .strict(),
]);

export type AgentQuestion = z.infer<typeof agentQuestionSchema>;
