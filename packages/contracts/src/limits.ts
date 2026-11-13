export const LIMITS = {
  messageCodePoints: 32_000,
  titleCodePoints: 60,
  manualTitleCodePoints: 200,
  fileBytes: 20 * 1024 * 1024,
  attachmentsPerMessage: 5,
  filesPerUser: 200,
  storedBytesPerUser: 500 * 1024 * 1024,
  pdfPages: 200,
  extractedChars: 1_000_000,
  decompressionBytes: 64 * 1024 * 1024,
  modelRequests: 10,
  toolCalls: 20,
  activeExecutionMs: 300_000,
  maxOutputTokens: 4096,
  activeRunsPerConversation: 1,
  activeRunsPerUser: 3,
  approvalMs: 24 * 60 * 60 * 1000,
  toolTimeoutMs: 20_000,
  pageReadTimeoutMs: 10_000,
  modelTimeoutMs: 90_000,
  searchResults: 5,
  pageReadsPerRun: 10,
  pageChars: 20_000,
  catalogFreshMs: 15 * 60 * 1000,
  catalogStaleMs: 24 * 60 * 60 * 1000,
  eventFlushMs: 100,
  eventFlushBytes: 2 * 1024,
  runsPerMinute: 10,
  searchesPerHour: 30,
  uploadsPerHour: 20,
  listDefault: 30,
  listMax: 100,
  leaseMs: 60_000,
  heartbeatMs: 15_000,
  abandonedUploadMs: 24 * 60 * 60 * 1000,
  eventRetainMs: 30 * 24 * 60 * 60 * 1000,
  idempotencyMs: 24 * 60 * 60 * 1000,
  downloadSeconds: 300,
} as const;

export const TOOL_GROUPS = ['web', 'files', 'gmail', 'calendar'] as const;
export type ToolGroup = (typeof TOOL_GROUPS)[number];

export const WRITE_TOOLS = [
  'create_mail_draft',
  'send_mail',
  'create_calendar_event',
  'update_calendar_event',
] as const;

export const READ_TOOLS = [
  'search_web',
  'read_web_page',
  'list_files',
  'read_file',
  'search_files',
  'list_project_documents',
  'read_project_document',
  'search_mail',
  'read_mail',
  'list_calendar_events',
  'get_calendar_availability',
] as const;

export const BUILTIN_TOOLS = ['switch_model', 'generate_image'] as const;

export const ALL_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS, ...BUILTIN_TOOLS] as const;
export type ToolName = (typeof ALL_TOOLS)[number];

export function isBuiltinTool(name: string): boolean {
  return (BUILTIN_TOOLS as readonly string[]).includes(name);
}

export function toolGroup(name: ToolName): ToolGroup {
  if (name === 'search_web' || name === 'read_web_page') return 'web';
  if (
    name === 'list_files' ||
    name === 'read_file' ||
    name === 'search_files' ||
    name === 'list_project_documents' ||
    name === 'read_project_document' ||
    name === 'switch_model' ||
    name === 'generate_image'
  )
    return 'files';
  if (
    name === 'search_mail' ||
    name === 'read_mail' ||
    name === 'create_mail_draft' ||
    name === 'send_mail'
  ) {
    return 'gmail';
  }
  return 'calendar';
}

export function isWriteTool(name: string): boolean {
  return (WRITE_TOOLS as readonly string[]).includes(name);
}
