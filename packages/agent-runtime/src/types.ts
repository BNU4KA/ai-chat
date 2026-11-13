import type { ToolName } from '@ai-chat/contracts';
export type Usage = {
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: string | null;
  cost_status: 'unknown' | 'estimated' | 'confirmed';
};

export type ToolCallDraft = { id: string; name: string; arguments: string };

export type ModelRequest = {
  apiKey: string;
  model: string;
  messages: unknown[];
  tools: { name: string; description: string; parameters: Record<string, unknown> }[];
  maxTokens: number;
  modelCalls: number;
  signal: AbortSignal;
  onDelta: (text: string) => Promise<void>;
};

export type ModelResult = {
  text: string;
  toolCalls: ToolCallDraft[];
  usage: Usage;
  generationId: string | null;
  submitted: boolean;
};

export type ModelAdapter = {
  complete(request: ModelRequest): Promise<ModelResult>;
};

export type ToolOutcome = {
  ok: boolean;
  data?: unknown;
  sources?: {
    citation_id?: string;
    kind: string;
    title: string;
    url?: string;
    file_id?: string;
    document_id?: string;
    page?: number;
    section?: string;
    excerpt?: string;
    retrieved_at?: string;
  }[];
  error?: { code: string; message: string; retryable: boolean };
  reference?: string;
};

export type ToolPorts = {
  listProjectDocuments?(offset: number, limit: number): Promise<ToolOutcome>;
  readProjectDocument?(input: {
    documentId: string;
    offset: number;
    limit: number;
    version?: number;
  }): Promise<ToolOutcome>;
  searchWeb?(query: string, max: number): Promise<ToolOutcome>;
  readPage?(url: string): Promise<ToolOutcome>;
  listFiles?(conversationId: string, ownerId: string): Promise<ToolOutcome>;
  readFile?(input: {
    ownerId: string;
    conversationId: string;
    fileId: string;
    pageStart?: number;
    pageEnd?: number;
  }): Promise<ToolOutcome>;
  searchFiles?(input: {
    ownerId: string;
    conversationId: string;
    query: string;
    fileIds?: string[];
  }): Promise<ToolOutcome>;
  searchMail?(query: string, max: number): Promise<ToolOutcome>;
  readMail?(messageId: string): Promise<ToolOutcome>;
  createDraft?(args: unknown): Promise<ToolOutcome>;
  sendMail?(args: unknown): Promise<ToolOutcome>;
  listEvents?(args: unknown): Promise<ToolOutcome>;
  freeBusy?(args: unknown): Promise<ToolOutcome>;
  createEvent?(args: unknown): Promise<ToolOutcome>;
  updateEvent?(args: unknown): Promise<ToolOutcome>;
  switchModel?(input: {
    ownerId: string;
    conversationId: string;
    query: string;
  }): Promise<ToolOutcome>;
  generateImage?(input: {
    ownerId: string;
    conversationId: string;
    assistantMessageId: string;
    prompt: string;
    modelQuery?: string;
    signal?: AbortSignal;
  }): Promise<ToolOutcome>;
};

export type Checkpoint = {
  uncertainModel: boolean;
  uncertainWriteId: string | null;
  pageReads: number;
  thread: unknown[];
  executionStarted: number;
  pendingCalls: ToolCallDraft[];
};

export type AgentDeps = {
  prepareMessages?: (
    ownerId: string,
    conversationId: string,
    messages: unknown[],
    signal: AbortSignal,
  ) => Promise<unknown[]>;
  authorizeTool?: (ownerId: string, runId: string, name: ToolName) => Promise<string | null>;
  prepareWrite?: (
    ownerId: string,
    runId: string,
    name: string,
    args: unknown,
  ) => Promise<{ args: unknown; preview?: Record<string, unknown> }>;
  now: () => Date;
  model: ModelAdapter;
  ports: ToolPorts;
  loadKey: (
    ownerId: string,
  ) => Promise<{
    version: number;
    apiKey: string;
    source?: 'personal' | 'managed';
    managedKeyId?: string | null;
  } | null>;
};
