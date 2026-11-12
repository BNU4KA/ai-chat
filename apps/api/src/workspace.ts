import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  z,
  AppError,
  projectInputSchema,
  documentInputSchema,
  rangeEditSchema,
  compactSchema,
  branchSchema,
  approvalRevisionSchema,
  scheduleInputSchema,
  meetingSlotsSchema,
  estimateTokens,
  estimateCost,
  workflowPrompts,
  type ToolName,
} from '@ai-chat/contracts';
import {
  projects,
  saveProject,
  removeProject,
  shareProjectFile,
  projectFiles,
  documentList,
  saveDocument,
  editDocumentRange,
  revisions,
  removeDocument,
  compactConversation,
  searchMessages,
  branchConversation,
  reviseApproval,
  withOwner,
  owned,
  workspaceDto,
} from '@ai-chat/database';
import { toolSchemas, recipientCount } from '@ai-chat/agent-runtime';
import { rawMail, type MailArgs } from '@ai-chat/integrations';
import {
  prepareGoogleWrite,
  modelCatalog,
  saveSchedule,
  listSchedules,
  pauseSchedule,
  deleteSchedule,
  suggestMeetingSlots,
} from '@ai-chat/services';
const uuid = (request: FastifyRequest) => z.uuid().parse((request.params as { id: string }).id);
export function registerWorkspace(
  app: FastifyInstance,
  versionOf: (request: FastifyRequest) => number,
) {
  app.get('/v1/projects', async (r) => ({ data: await projects(r.ownerId) }));
  app.post('/v1/projects', async (r, reply) => {
    reply.status(201);
    return { data: await saveProject(r.ownerId, projectInputSchema.parse(r.body)) };
  });
  app.patch('/v1/projects/:id', async (r) => ({
    data: await saveProject(r.ownerId, projectInputSchema.parse(r.body), uuid(r), versionOf(r)),
  }));
  app.delete('/v1/projects/:id', async (r, reply) => {
    await removeProject(r.ownerId, uuid(r), versionOf(r));
    reply.status(204).send();
  });
  app.get('/v1/projects/:id/files', async (r) => ({
    data: await projectFiles(r.ownerId, uuid(r)),
  }));
  app.post('/v1/projects/:id/files', async (r) => {
    const b = z
      .object({ file_id: z.uuid(), remove: z.boolean().default(false) })
      .strict()
      .parse(r.body);
    await shareProjectFile(r.ownerId, uuid(r), b.file_id, b.remove);
    return { data: { ok: true } };
  });
  app.get('/v1/documents', async (r) => ({ data: await documentList(r.ownerId) }));
  app.get('/v1/documents/:id', async (r) => ({
    data: await withOwner(r.ownerId, async (tx) =>
      workspaceDto(await owned(tx, 'documents', uuid(r))),
    ),
  }));
  app.post('/v1/documents', async (r, reply) => {
    reply.status(201);
    return { data: await saveDocument(r.ownerId, documentInputSchema.parse(r.body)) };
  });
  app.patch('/v1/documents/:id', async (r) => ({
    data: await saveDocument(r.ownerId, documentInputSchema.parse(r.body), uuid(r), versionOf(r)),
  }));
  app.post('/v1/documents/:id/replace', async (r) => ({
    data: await editDocumentRange(r.ownerId, uuid(r), versionOf(r), rangeEditSchema.parse(r.body)),
  }));
  app.get('/v1/documents/:id/revisions', async (r) => ({
    data: await revisions(r.ownerId, uuid(r)),
  }));
  app.delete('/v1/documents/:id', async (r, reply) => {
    await removeDocument(r.ownerId, uuid(r), versionOf(r));
    reply.status(204).send();
  });
  app.get('/v1/documents/:id/export', async (r, reply) => {
    const doc = await withOwner(r.ownerId, async (tx) => owned(tx, 'documents', uuid(r)));
    const format = (r.query as { format?: string }).format;
    const escape = (s: string) =>
      s.replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
      );
    reply
      .header(
        'content-disposition',
        `attachment; filename="document.${format === 'html' ? 'html' : 'md'}"`,
      )
      .header('cache-control', 'no-store');
    if (format === 'html')
      return reply
        .type('text/html; charset=utf-8')
        .send(
          `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(String(doc.title))}</title><body><h1>${escape(String(doc.title))}</h1><pre style="white-space:pre-wrap;font-family:system-ui;line-height:1.6">${escape(String(doc.content))}</pre></body></html>`,
        );
    return reply.type('text/markdown; charset=utf-8').send(`# ${doc.title}\n\n${doc.content}`);
  });
  app.post('/v1/conversations/:id/compact', async (r) => {
    const b = compactSchema.parse(r.body);
    await compactConversation(r.ownerId, uuid(r), versionOf(r), b.note, b.through_seq);
    return { data: { ok: true } };
  });
  app.delete('/v1/conversations/:id/compact', async (r) => {
    await compactConversation(r.ownerId, uuid(r), versionOf(r), '', '0');
    return { data: { ok: true } };
  });
  app.get('/v1/search/messages', async (r) => {
    const q = z
      .object({
        query: z.string().trim().min(1).max(300),
        offset: z.coerce.number().int().min(0).max(10000).default(0),
      })
      .parse(r.query);
    return { data: await searchMessages(r.ownerId, q.query, q.offset) };
  });
  app.get('/v1/messages/:id/context', async (r) => ({
    data: await withOwner(r.ownerId, async (tx) => {
      const message = (
        await tx.query(
          'select m.* from messages m join conversations c on c.id=m.conversation_id where m.id=$1',
          [uuid(r)],
        )
      ).rows[0];
      if (!message) throw new AppError(404, 'NOT_FOUND', 'Message not found');
      const rows = (
        await tx.query(
          `select m.*,coalesce((select json_agg(file_id) from message_files where message_id=m.id),'[]'::json) as file_ids from messages m where conversation_id=$1 and seq between greatest(0,$2::bigint-10) and $2::bigint+10 order by seq`,
          [message.conversation_id, message.seq],
        )
      ).rows;
      return rows.map((row) => ({ ...workspaceDto(row), seq: String(row.seq) }));
    }),
  }));
  app.post('/v1/messages/:id/branch', async (r) => ({
    data: await branchConversation(r.ownerId, uuid(r), branchSchema.parse(r.body).text),
  }));
  app.get('/v1/workflows', async () => ({
    data: Object.entries(workflowPrompts).map(([id, prompt]) => ({ id, prompt })),
  }));
  app.post('/v1/approvals/:id/revise', async (r) => {
    const b = approvalRevisionSchema.parse(r.body),
      id = uuid(r);
    const row = await withOwner(
      r.ownerId,
      async (tx) =>
        (
          await tx.query(
            'select a.run_id,t.name from approvals a join tool_calls t on t.id=a.tool_call_id join runs r on r.id=a.run_id join conversations c on c.id=r.conversation_id where a.id=$1',
            [id],
          )
        ).rows[0],
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Proposal not found');
    const name = String(row.name) as ToolName;
    if (
      ![
        'send_mail',
        'create_mail_draft',
        'create_calendar_event',
        'update_calendar_event',
      ].includes(name)
    )
      throw new AppError(422, 'VALIDATION_ERROR', 'Action cannot be edited');
    const args = toolSchemas[name].parse(b.arguments);
    if (
      name.includes('mail') &&
      recipientCount(args as { to: unknown[]; cc?: unknown[]; bcc?: unknown[] }) > 20
    )
      throw new AppError(422, 'VALIDATION_ERROR', 'Too many recipients');
    if (name.includes('mail')) rawMail(args as MailArgs, 'preview-validation');
    const prepared = await prepareGoogleWrite(r.ownerId, String(row.run_id), name, args);
    return {
      data: await reviseApproval(r.ownerId, id, b.args_hash, prepared.args, prepared.preview),
    };
  });
  app.post('/v1/conversations/:id/estimate', async (r) => {
    const id = uuid(r),
      body = z
        .object({ text: z.string().max(32000), file_ids: z.array(z.uuid()).default([]) })
        .strict()
        .parse(r.body);
    const chat = await withOwner(r.ownerId, (tx) => owned(tx, 'conversations', id));
    const model = (await modelCatalog(r.ownerId)).find((m) => m.id === chat.model_id);
    if (!model) throw new AppError(422, 'MODEL_UNAVAILABLE', 'Choose an available model');
    const meta = {
      contextLength: model.context_length,
      maxOutputTokens: Math.min(
        4096,
        model.max_output_tokens ?? 4096,
        Math.floor((model.context_length ?? 32000) / 2),
      ),
    };
    const history = await withOwner(
      r.ownerId,
      async (tx) =>
        (
          await tx.query(
            'select role,content from messages where conversation_id=$1 and seq>$2 order by seq',
            [id, chat.context_through_seq],
          )
        ).rows,
    );
    const tokens =
      estimateTokens([
        ...history,
        { role: 'user', content: body.text },
        String(chat.context_note),
      ]) +
      body.file_ids.length * 24000;
    return {
      data: {
        input_tokens_estimated: tokens,
        context_length: meta.contextLength,
        output_tokens_reserved: meta.maxOutputTokens ?? 4096,
        cost_usd_estimated: estimateCost(
          tokens,
          meta.maxOutputTokens ?? 4096,
          model.input_price_per_million_usd,
          model.output_price_per_million_usd,
        ),
        budget_usd: chat.budget_usd,
        includes_tools_and_project: false,
      },
    };
  });
  app.get('/v1/schedules', async (r) => ({ data: await listSchedules(r.ownerId) }));
  app.post('/v1/schedules', async (r, reply) => {
    const b = scheduleInputSchema.strict().parse(r.body);
    reply.status(201);
    return { data: await saveSchedule(r.ownerId, b) };
  });
  app.patch('/v1/schedules/:id', async (r) => {
    const b = z.object({ paused: z.boolean() }).strict().parse(r.body);
    return { data: await pauseSchedule(r.ownerId, uuid(r), versionOf(r), b.paused) };
  });
  app.delete('/v1/schedules/:id', async (r, reply) => {
    await deleteSchedule(r.ownerId, uuid(r), versionOf(r));
    reply.status(204).send();
  });
  app.get('/v1/schedules/:id/history', async (r) => ({
    data: await withOwner(r.ownerId, async (tx) => {
      await owned(tx, 'schedules', uuid(r));
      return (
        await tx.query(
          'select * from schedule_occurrences where schedule_id=$1 order by due_at desc limit 50',
          [uuid(r)],
        )
      ).rows.map(workspaceDto);
    }),
  }));
  app.get('/v1/notices', async (r) => ({
    data: await withOwner(r.ownerId, async (tx) =>
      (
        await tx.query(
          `select n.*,r.conversation_id from notices n left join runs r on r.id=n.run_id left join conversations c on c.id=r.conversation_id where n.run_id is null or c.id is not null order by n.created_at desc limit 50`,
        )
      ).rows.map(workspaceDto),
    ),
  }));
  app.post('/v1/notices/:id/read', async (r) => {
    await withOwner(r.ownerId, (tx) =>
      tx.query('update notices set read_at=now() where id=$1', [uuid(r)]),
    );
    return { data: { ok: true } };
  });
  app.post('/v1/meetings/slots', async (r) => ({
    data: await suggestMeetingSlots(r.ownerId, meetingSlotsSchema.parse(r.body)),
  }));
}
