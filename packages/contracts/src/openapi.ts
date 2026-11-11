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
  const successStatuses: [string, string, string][] = [
    ['/v1/credentials/openrouter', 'delete', '204'],
    ['/v1/conversations', 'post', '201'],
    ['/v1/conversations/{id}', 'delete', '202'],
    ['/v1/conversations/{id}/messages', 'post', '202'],
    ['/v1/messages/{id}/retry', 'post', '202'],
    ['/v1/files/uploads', 'post', '201'],
    ['/v1/files/{id}/finalize', 'post', '202'],
    ['/v1/files/{id}', 'delete', '202'],
    ['/v1/integrations/google/capabilities/{capability}', 'delete', '202'],
    ['/v1/account', 'delete', '202'],
  ];
  for (const [path, method, status] of successStatuses) {
    const operation = paths[path]![method] as { responses: Record<string, unknown> };
    operation.responses[status] =
      status === '204' ? { description: 'Removed; no response body' } : operation.responses['200'];
    delete operation.responses['200'];
  }
  const capabilityOperation = paths['/v1/integrations/google/capabilities/{capability}']!
    .delete as { parameters: { name: string; schema: unknown }[] };
  capabilityOperation.parameters.find((parameter) => parameter.name === 'capability')!.schema = {
    type: 'string',
    enum: ['gmail', 'calendar'],
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
