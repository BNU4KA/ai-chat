import { z } from 'zod';
import * as schemas from './schemas.ts';
export function applicationOpenApi() {
  const components: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(schemas))
    components[name] = z.toJSONSchema(schema, { unrepresentable: 'any' });
  const request = (name: keyof typeof schemas) => ({
    required: true,
    content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } },
  });
  const response = (name?: keyof typeof schemas, collection = false) => ({
    '200': {
      description: 'Success',
      content: {
        'application/json': {
          schema: name
            ? {
                type: 'object',
                properties: {
                  data: collection
                    ? { type: 'array', items: { $ref: `#/components/schemas/${name}` } }
                    : { $ref: `#/components/schemas/${name}` },
                  ...(collection ? { next_cursor: { type: ['string', 'null'] } } : {}),
                },
              }
            : { type: 'object' },
        },
      },
    },
    '401': { description: 'Authentication required' },
    '404': { description: 'Missing or unowned resource' },
    '409': { description: 'Conflict' },
    '422': { description: 'Validation failed' },
  });
  const paths: Record<string, Record<string, unknown>> = {};
  function route(
    path: string,
    method: string,
    responseName?: keyof typeof schemas,
    body?: keyof typeof schemas,
    collection = false,
  ) {
    const params = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
      name: match[1],
      in: 'path',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    }));
    const concurrency = ['patch', 'put', 'delete'].includes(method)
      ? [
          {
            name: 'If-Match',
            in: 'header',
            required: true,
            schema: { type: 'string' },
            description: 'Quoted resource version, such as "1"',
          },
        ]
      : [];
    const idempotency =
      (path.endsWith('/messages') && method === 'post') || path.endsWith('/retry')
        ? [
            {
              name: 'Idempotency-Key',
              in: 'header',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ]
        : [];
    paths[path] ??= {};
    paths[path][method] = {
      operationId: method + path.replace(/[^a-z0-9]/gi, '_'),
      parameters: [...params, ...concurrency, ...idempotency],
      responses: response(responseName, collection),
      ...(body ? { requestBody: request(body) } : {}),
    };
  }
  route('/v1/profile', 'get', 'profileSchema');
  route('/v1/profile', 'patch', 'profileSchema', 'profilePatchSchema');
  route('/v1/credentials/openrouter', 'get', 'credentialSchema');
  route('/v1/credentials/openrouter', 'put', 'credentialSchema', 'credentialPutSchema');
  route('/v1/credentials/openrouter', 'delete');
  route('/v1/admin/openrouter-keys', 'get', 'adminOpenRouterKeySchema', undefined, true);
  route('/v1/admin/openrouter-keys', 'post', 'adminOpenRouterKeySchema', 'adminOpenRouterKeyCreateSchema');
  route('/v1/admin/openrouter-keys/{id}', 'delete');
  route('/v1/admin/users', 'get', 'adminUserSchema', undefined, true);
  route('/v1/admin/users/{id}/openrouter-key', 'patch', 'adminUserSchema', 'adminAssignKeySchema');
  route('/v1/admin/users/{id}', 'delete');
  route('/v1/models', 'get', 'modelSchema', undefined, true);
  route('/v1/capabilities', 'get');
  route('/v1/conversations', 'get', 'conversationSchema', undefined, true);
  route('/v1/conversations', 'post', 'conversationSchema', 'createConversationSchema');
  route('/v1/conversations/{id}', 'get', 'conversationSchema');
  route('/v1/conversations/{id}', 'patch', 'conversationSchema', 'conversationPatchSchema');
  route('/v1/conversations/{id}', 'delete');
  route('/v1/conversations/{id}/messages', 'get', 'messageSchema', undefined, true);
  route('/v1/conversations/{id}/messages', 'post', undefined, 'messageCreateSchema');
  route('/v1/messages/{id}/retry', 'post');
  route('/v1/conversations/{id}/runs', 'get', 'runSchema', undefined, true);
  route('/v1/runs/{id}', 'get');
  route('/v1/runs/{id}/cancel', 'post', 'runSchema', 'cancelRunSchema');
  route('/v1/runs/{id}/events', 'get');
  route('/v1/approvals/{id}/decision', 'post', undefined, 'approvalDecisionSchema');
  route('/v1/files/uploads', 'post', undefined, 'uploadCreateSchema');
  route('/v1/conversations/{id}/files', 'get', 'fileSchema', undefined, true);
  route('/v1/files/{id}', 'get', 'fileSchema');
  route('/v1/files/{id}', 'delete');
  route('/v1/files/{id}/finalize', 'post', 'fileSchema');
  route('/v1/files/{id}/download', 'get');
  route('/v1/integrations/google', 'get', 'integrationSchema');
  route('/v1/integrations/google/connect', 'post', undefined, 'connectIntegrationSchema');
  route('/v1/integrations/google/capabilities/{capability}', 'delete', 'integrationSchema');
  route('/v1/account', 'delete', undefined, 'deleteAccountSchema');
  route('/v1/projects', 'get', 'projectSchema', undefined, true);
  route('/v1/projects', 'post', 'projectSchema', 'projectInputSchema');
  route('/v1/projects/{id}', 'patch', 'projectSchema', 'projectInputSchema');
  route('/v1/projects/{id}', 'delete');
  route('/v1/projects/{id}/files', 'get');
  route('/v1/projects/{id}/files', 'post');
  route('/v1/documents', 'get', 'documentSchema', undefined, true);
  route('/v1/documents', 'post', 'documentSchema', 'documentInputSchema');
  route('/v1/documents/{id}', 'get', 'documentSchema');
  route('/v1/documents/{id}', 'patch', 'documentSchema', 'documentInputSchema');
  route('/v1/documents/{id}', 'delete');
  route('/v1/documents/{id}/replace', 'post', 'documentSchema', 'rangeEditSchema');
  route('/v1/documents/{id}/revisions', 'get');
  route('/v1/documents/{id}/export', 'get');
  route('/v1/conversations/{id}/compact', 'post', undefined, 'compactSchema');
  route('/v1/conversations/{id}/compact', 'delete');
  route('/v1/conversations/{id}/estimate', 'post');
  route('/v1/search/messages', 'get');
  route('/v1/messages/{id}/context', 'get');
  route('/v1/messages/{id}/branch', 'post', undefined, 'branchSchema');
  route('/v1/workflows', 'get');
  route('/v1/approvals/{id}/revise', 'post', undefined, 'approvalRevisionSchema');
  route('/v1/schedules', 'get', 'scheduleSchema', undefined, true);
  route('/v1/schedules', 'post', 'scheduleSchema', 'scheduleInputSchema');
  route('/v1/schedules/{id}', 'patch', 'scheduleSchema');
  route('/v1/schedules/{id}', 'delete');
  route('/v1/schedules/{id}/history', 'get');
  route('/v1/notices', 'get');
  route('/v1/notices/{id}/read', 'post');
  route('/v1/meetings/slots', 'post', undefined, 'meetingSlotsSchema');
  for (const path of ['/v1/documents/{id}/replace', '/v1/conversations/{id}/compact']) {
    const operation = paths[path]!.post as { parameters: unknown[] };
    operation.parameters.push({
      name: 'If-Match',
      in: 'header',
      required: true,
      schema: { type: 'string' },
      description: 'Quoted current version',
    });
  }
  const successStatuses: [string, string, string][] = [
    ['/v1/credentials/openrouter', 'delete', '204'],
    ['/v1/admin/openrouter-keys', 'post', '201'],
    ['/v1/admin/openrouter-keys/{id}', 'delete', '204'],
    ['/v1/admin/users/{id}', 'delete', '202'],
    ['/v1/conversations', 'post', '201'],
    ['/v1/conversations/{id}', 'delete', '202'],
    ['/v1/conversations/{id}/messages', 'post', '202'],
    ['/v1/messages/{id}/retry', 'post', '202'],
    ['/v1/files/uploads', 'post', '201'],
    ['/v1/files/{id}/finalize', 'post', '202'],
    ['/v1/files/{id}', 'delete', '202'],
    ['/v1/integrations/google/capabilities/{capability}', 'delete', '202'],
    ['/v1/account', 'delete', '202'],
    ['/v1/projects', 'post', '201'],
    ['/v1/documents', 'post', '201'],
    ['/v1/schedules', 'post', '201'],
    ['/v1/projects/{id}', 'delete', '204'],
    ['/v1/documents/{id}', 'delete', '204'],
    ['/v1/schedules/{id}', 'delete', '204'],
  ];
  for (const [path, method, status] of successStatuses) {
    const operation = paths[path]![method] as { responses: Record<string, unknown> };
    operation.responses[status] =
      status === '204' ? { description: 'Removed; no response body' } : operation.responses['200'];
    delete operation.responses['200'];
  }
  for (const [path, method] of [
    ['/v1/admin/openrouter-keys/{id}', 'delete'],
    ['/v1/admin/users/{id}', 'delete'],
    ['/v1/admin/users/{id}/openrouter-key', 'patch'],
  ] as const) {
    const operation = paths[path]![method] as { parameters: { name: string }[] };
    operation.parameters = operation.parameters.filter((parameter) => parameter.name !== 'If-Match');
  }
  const capabilityOperation = paths['/v1/integrations/google/capabilities/{capability}']!
    .delete as { parameters: { name: string; schema: unknown }[] };
  capabilityOperation.parameters.find((parameter) => parameter.name === 'capability')!.schema = {
    type: 'string',
    enum: ['gmail', 'calendar'],
  };
  const exportOperation = paths['/v1/documents/{id}/export']!.get as Record<string, unknown>;
  exportOperation.responses = {
    '200': {
      description: 'Authenticated private document download',
      content: {
        'text/markdown': { schema: { type: 'string' } },
        'text/html': { schema: { type: 'string' } },
      },
    },
    '401': { description: 'Authentication required' },
    '404': { description: 'Missing or unowned document' },
  };
  const sse = paths['/v1/runs/{id}/events']!.get as Record<string, unknown>;
  sse.responses = {
    '200': {
      description: 'Persisted event replay followed by live events. Closes on a terminal event.',
      content: { 'text/event-stream': { schema: { type: 'string' } } },
    },
  };
  return {
    openapi: '3.1.0',
    info: {
      title: 'AI Chat API',
      version: '0.1.0',
      description:
        'Internal application API. Schemas are generated from the same Zod definitions used by the server.',
    },
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: components,
    },
  };
}
