import { z } from 'zod';
import { LIMITS, TOOL_GROUPS } from './limits.ts';
import { codePointLength } from './text.ts';

const timestamp = z.iso.datetime({ offset: true });
const toolGroup = z.enum(TOOL_GROUPS);

export const usageSchema = z.object({
  input_tokens: z.number().int().nullable(),
  output_tokens: z.number().int().nullable(),
  cost_usd: z.string().nullable(),
  cost_status: z.enum(['unknown', 'estimated', 'confirmed']),
});

export const profileSchema = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  is_admin: z.boolean(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  locale: z.enum(['auto', 'en', 'ru']),
  timezone: z.string(),
  theme: z.enum(['system', 'light', 'dark']),
  version: z.number().int(),
  created_at: timestamp,
  updated_at: timestamp,
});

export const profilePatchSchema = z
  .object({
    display_name: z.string().trim().min(1).max(80).nullable().optional(),
    theme: z.enum(['system', 'light', 'dark']).optional(),
    timezone: z.string().optional(),
    locale: z.enum(['auto', 'en', 'ru']).optional(),
  })
  .strict();

export const credentialSchema = z.object({
  configured: z.boolean(),
  source: z.enum(['personal', 'managed']).nullable(),
  last_four: z.string().nullable(),
  status: z.enum(['missing', 'valid']),
  version: z.number().int(),
  validated_at: timestamp.nullable(),
});

export const adminOpenRouterKeySchema = z.object({
  id: z.uuid(),
  label: z.string(),
  last_four: z.string(),
  version: z.number().int(),
  validated_at: timestamp,
  created_at: timestamp,
  assigned_users_count: z.number().int(),
});

export const adminOpenRouterKeyCreateSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    api_key: z.string().trim().min(1).max(400),
  })
  .strict();

export const adminManagedKeyRefSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  last_four: z.string(),
});

export const adminUserSchema = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  created_at: timestamp,
  deletion_requested_at: timestamp.nullable(),
  key_source: z.enum(['personal', 'managed', 'missing']),
  has_personal_key: z.boolean(),
  managed_key: adminManagedKeyRefSchema.nullable(),
  conversations_count: z.number().int(),
  total_cost_usd: z.string(),
});

export const adminAssignKeySchema = z
  .object({
    managed_key_id: z.uuid().nullable(),
  })
  .strict();

export const credentialPutSchema = z
  .object({
    api_key: z.string().trim().min(1).max(400),
  })
  .strict();

export const modelSchema = z.object({
  id: z.string(),
  name: z.string(),
  context_length: z.number().int().nullable(),
  supports_tools: z.boolean(),
  supports_images: z.boolean().default(false),
  supports_image_output: z.boolean().optional().default(false),
  max_output_tokens: z.number().int().nullable().optional(),
  input_price_per_million_usd: z.string().nullable(),
  output_price_per_million_usd: z.string().nullable(),
  supported_parameters: z.array(z.string()),
  catalog_fetched_at: timestamp,
  catalog_stale: z.boolean(),
});

export const conversationSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  project_id: z.uuid().nullable().optional(),
  context_note: z.string().optional(),
  context_through_seq: z.string().optional(),
  research_mode: z.boolean().optional(),
  budget_usd: z.string().nullable().optional(),
  model_id: z.string().nullable(),
  enabled_tools: z.array(toolGroup),
  version: z.number().int(),
  created_at: timestamp,
  updated_at: timestamp,
});

export const createConversationSchema = z
  .object({
    model_id: z.string().min(1).max(200).default('anthropic/claude-haiku-5.5'),
    enabled_tools: z.array(toolGroup).optional(),
  })
  .strict();

export const conversationPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(LIMITS.manualTitleCodePoints).optional(),
    project_id: z.uuid().nullable().optional(),
    research_mode: z.boolean().optional(),
    budget_usd: z
      .string()
      .regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,9})?$/)
      .refine((v) => Number(v) > 0 && Number(v) <= 100)
      .nullable()
      .optional(),
    model_id: z.string().min(1).max(200).nullable().optional(),
    enabled_tools: z.array(toolGroup).optional(),
  })
  .strict();

export const messageSchema = z.object({
  id: z.uuid(),
  conversation_id: z.uuid(),
  run_id: z.uuid().nullable(),
  seq: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  status: z.enum(['pending', 'complete', 'partial', 'failed', 'cancelled']),
  file_ids: z.array(z.uuid()),
  created_at: timestamp,
});

export const messageCreateSchema = z
  .object({
    client_message_id: z.uuid(),
    text: z
      .string()
      .refine((text) => codePointLength(text) <= LIMITS.messageCodePoints, 'Message is too long'),
    file_ids: z.array(z.uuid()).max(LIMITS.attachmentsPerMessage),
  })
  .strict();

export const runSchema = z.object({
  id: z.uuid(),
  conversation_id: z.uuid(),
  user_message_id: z.uuid(),
  assistant_message_id: z.uuid(),
  status: z.enum(['queued', 'running', 'waiting_approval', 'completed', 'cancelled', 'failed']),
  model_id: z.string(),
  attempt: z.number().int(),
  version: z.number().int(),
  last_event_seq: z.string(),
  error_code: z.string().nullable(),
  usage: usageSchema,
  cancel_requested_at: timestamp.nullable(),
  created_at: timestamp,
  finished_at: timestamp.nullable(),
});

export const cancelRunSchema = z.object({}).strict();

export const approvalDecisionSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    args_hash: z.string().min(1),
  })
  .strict();

export const fileSchema = z.object({
  id: z.uuid(),
  conversation_id: z.uuid(),
  filename: z.string(),
  byte_size: z.number().int(),
  detected_mime: z.string().nullable(),
  status: z.enum(['pending_upload', 'processing', 'ready', 'failed', 'deleted']),
  error_code: z.string().nullable(),
  version: z.number().int(),
  created_at: timestamp,
});

export const uploadCreateSchema = z
  .object({
    conversation_id: z.uuid(),
    filename: z.string().trim().min(1).max(240),
    byte_size: z.number().int().positive().max(LIMITS.fileBytes),
    declared_mime: z.string().min(1).max(200),
  })
  .strict();

export const integrationSchema = z.object({
  status: z.enum(['disconnected', 'connected', 'reauth_required', 'disconnecting']),
  account_email: z.string().nullable(),
  capabilities: z.object({
    gmail: z.boolean(),
    calendar: z.boolean(),
  }),
  version: z.number().int(),
  last_error_code: z.string().nullable(),
});

export const connectIntegrationSchema = z
  .object({
    capability: z.enum(['gmail', 'calendar']),
    return_target: z.enum(['web', 'native']),
  })
  .strict();

export const deleteAccountSchema = z
  .object({
    confirmation: z.literal('DELETE'),
  })
  .strict();

export const eventEnvelopeSchema = z.object({
  run_id: z.uuid(),
  seq: z.string(),
  type: z.string(),
  timestamp: timestamp,
  payload: z.record(z.string(), z.unknown()),
});

export const healthLiveSchema = z.object({ status: z.literal('ok') });

export const healthReadySchema = z.object({
  status: z.enum(['ok', 'not_ready']),
  checks: z.object({
    database: z.enum(['ok', 'unconfigured', 'unavailable']),
    queue: z.enum(['ok', 'unconfigured', 'unavailable']),
  }),
});

export const projectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    memory: z.string().max(24000).default(''),
  })
  .strict();
export const projectSchema = projectInputSchema.extend({
  id: z.uuid(),
  version: z.number().int(),
  created_at: timestamp,
  updated_at: timestamp,
});
export const documentInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    content: z.string().max(200000),
    project_id: z.uuid().nullable().default(null),
  })
  .strict();
export const documentSchema = documentInputSchema.extend({
  id: z.uuid(),
  version: z.number().int(),
  created_at: timestamp,
  updated_at: timestamp,
});
export const rangeEditSchema = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    expected: z.string().max(200000),
    replacement: z.string().max(200000),
  })
  .strict()
  .refine((v) => v.end >= v.start, 'Invalid range');
export const branchSchema = z.object({ text: z.string().trim().min(1).max(32000) }).strict();
export const compactSchema = z
  .object({
    note: z.string().trim().min(1).max(24000),
    through_seq: z.string().regex(/^\d+$/),
  })
  .strict();
export const approvalRevisionSchema = z
  .object({ args_hash: z.string().min(1), arguments: z.record(z.string(), z.unknown()) })
  .strict();
export const scheduleInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  prompt: z.string().trim().min(1).max(16000),
  model_id: z.string().min(1).max(200),
  enabled_tools: z.array(toolGroup),
  project_id: z.uuid().nullable().default(null),
  timezone: z.string().min(1).max(100),
  local_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weekday: z.number().int().min(0).max(6).nullable().default(null),
  budget_usd: z
    .string()
    .regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,9})?$/)
    .refine((v) => Number(v) > 0 && Number(v) <= 100),
});
export const scheduleSchema = scheduleInputSchema.extend({
  id: z.uuid(),
  paused: z.boolean(),
  next_at: timestamp,
  last_error: z.string().nullable(),
  version: z.number().int(),
  created_at: timestamp,
  updated_at: timestamp,
});
export const meetingSlotsSchema = z
  .object({
    time_min: timestamp,
    time_max: timestamp,
    timezone: z.string().min(1).max(100),
    duration_minutes: z.number().int().min(5).max(480).default(30),
    buffer_minutes: z.number().int().min(0).max(120).default(15),
    work_start: z.number().int().min(0).max(23).default(9),
    work_end: z.number().int().min(1).max(24).default(18),
  })
  .strict()
  .refine((v) => v.work_end > v.work_start, 'Invalid working hours');
