import { z } from 'zod';
import { LIMITS, type ToolName } from '@ai-chat/contracts';

const email = z
  .object({
    address: z.email(),
    name: z.string().max(200).optional(),
  })
  .strict();

const range = z.iso.datetime({ offset: true });

export const toolSchemas = {
  list_project_documents: z
    .object({
      offset: z.number().int().min(0).max(100000).default(0),
      limit: z.number().int().min(1).max(20).default(20),
    })
    .strict(),
  read_project_document: z
    .object({
      document_id: z.uuid(),
      offset: z.number().int().min(0).max(200000).default(0),
      limit: z.number().int().min(1).max(8000).default(8000),
      version: z.number().int().positive().optional(),
    })
    .strict(),
  search_web: z
    .object({
      query: z.string().min(1).max(500),
      max_results: z.number().int().min(1).max(LIMITS.searchResults).optional(),
    })
    .strict(),
  read_web_page: z.object({ url: z.string().min(1).max(2000) }).strict(),
  list_files: z.object({}).strict(),
  read_file: z
    .object({
      file_id: z.uuid(),
      page_start: z.number().int().min(1).optional(),
      page_end: z.number().int().min(1).optional(),
    })
    .strict(),
  search_files: z
    .object({
      query: z.string().min(1).max(500),
      file_ids: z.array(z.uuid()).max(20).optional(),
    })
    .strict(),
  search_mail: z
    .object({
      query: z.string().min(1).max(500),
      max_results: z.number().int().min(1).max(10).optional(),
    })
    .strict(),
  read_mail: z.object({ message_id: z.string().min(1).max(200) }).strict(),
  create_mail_draft: z
    .object({
      to: z.array(email).min(1),
      cc: z.array(email).optional(),
      bcc: z.array(email).optional(),
      subject: z.string().max(200),
      body_text: z.string().max(20_000),
    })
    .strict(),
  send_mail: z
    .object({
      to: z.array(email).min(1),
      cc: z.array(email).optional(),
      bcc: z.array(email).optional(),
      subject: z.string().max(200),
      body_text: z.string().max(20_000),
    })
    .strict(),
  list_calendar_events: z.object({ time_min: range, time_max: range }).strict(),
  get_calendar_availability: z
    .object({ time_min: range, time_max: range, timezone: z.string().min(1).max(80) })
    .strict(),
  create_calendar_event: z
    .object({
      title: z.string().min(1).max(200),
      start: range,
      end: range,
      timezone: z.string().min(1).max(80),
      attendees: z.array(email).max(20).optional(),
      description: z.string().max(8000).optional(),
    })
    .strict(),
  update_calendar_event: z
    .object({
      event_id: z.string().min(1).max(400),
      expected_etag: z.string().min(1).max(400),
      title: z.string().min(1).max(200).optional(),
      start: range.optional(),
      end: range.optional(),
      timezone: z.string().min(1).max(80).optional(),
      attendees: z.array(email).max(20).optional(),
      description: z.string().max(8000).optional(),
    })
    .strict(),
} satisfies Record<ToolName, z.ZodType>;

export const toolDescriptions: Record<ToolName, string> = {
  list_project_documents:
    'List all documents explicitly shared through the current project, with pagination and version numbers.',
  read_project_document:
    'Read a project document in bounded parts. Offsets count Unicode characters. Use next_offset and the same version to read more. Project previews are incomplete; read relevant sections before answering.',
  search_web: 'Search the public web. Returns titles, URLs, and excerpts.',
  read_web_page: 'Read public text from an http or https URL.',
  list_files: 'List ready files in this conversation.',
  read_file: 'Read extracted text from a ready file in this conversation.',
  search_files: 'Search extracted text in this conversation.',
  search_mail: 'Search the connected mailbox.',
  read_mail: 'Read one plain-text email.',
  create_mail_draft: 'Prepare a plain-text Gmail draft. Requires confirmation.',
  send_mail: 'Prepare a plain-text email to send. Requires confirmation.',
  list_calendar_events: 'List timed events on the primary calendar.',
  get_calendar_availability: 'Show busy intervals on the primary calendar.',
  create_calendar_event: 'Prepare a timed primary-calendar event. Requires confirmation.',
  update_calendar_event: 'Prepare a change to an existing event. Requires confirmation.',
};

export function parametersFor(name: ToolName): Record<string, unknown> {
  return z.toJSONSchema(toolSchemas[name]) as Record<string, unknown>;
}

export function recipientCount(value: { to: unknown[]; cc?: unknown[]; bcc?: unknown[] }): number {
  return value.to.length + (value.cc?.length ?? 0) + (value.bcc?.length ?? 0);
}
