import { randomUUID } from 'node:crypto';
import { AppError, replaceRange, type ToolGroup } from '@ai-chat/contracts';
import { withOwner, withWorker, type Tx } from './pool.ts';
import { sha256, appendEvent, mustIso } from './repo.ts';
type Row = Record<string, unknown>;
export function workspaceDto(row: Row): Row {
  const result = { ...row };
  delete result.owner_id;
  for (const key of ['created_at', 'updated_at', 'next_at', 'due_at', 'read_at'])
    if (result[key] instanceof Date) result[key] = mustIso(result[key] as Date);
  return result;
}
export async function owned(
  tx: Tx,
  table: 'projects' | 'documents' | 'schedules' | 'conversations',
  id: string,
  version?: number,
) {
  const row = (await tx.query(`select * from ${table} where id=$1 for update`, [id])).rows[0];
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Resource not found');
  if (version !== undefined && Number(row.version) !== version)
    throw new AppError(409, 'VERSION_CONFLICT', 'Resource changed. Reload before saving.');
  return row;
}
export async function projects(owner: string) {
  return withOwner(owner, async (tx) =>
    (await tx.query('select * from projects order by updated_at desc limit 100')).rows.map(
      workspaceDto,
    ),
  );
}
export async function saveProject(
  owner: string,
  input: { name: string; memory: string },
  id?: string,
  version?: number,
) {
  return withOwner(owner, async (tx) => {
    if (id) await owned(tx, 'projects', id, version);
    const row = id
      ? (
          await tx.query(
            'update projects set name=$2,memory=$3,version=version+1,updated_at=now() where id=$1 returning *',
            [id, input.name, input.memory],
          )
        ).rows[0]
      : (
          await tx.query(
            'insert into projects(owner_id,name,memory) values($1,$2,$3) returning *',
            [owner, input.name, input.memory],
          )
        ).rows[0];
    return workspaceDto(row!);
  });
}
export async function removeProject(owner: string, id: string, version: number) {
  // Explicit ownership is required here: API RLS hides soft-deleted conversations.
  return withWorker(async (tx) => {
    const row = (
      await tx.query(
        'select p.* from projects p join profiles u on u.id=p.owner_id where p.id=$1 and p.owner_id=$2 and u.deletion_requested_at is null for update of p',
        [id, owner],
      )
    ).rows[0];
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Project not found');
    if (Number(row.version) !== version)
      throw new AppError(409, 'VERSION_CONFLICT', 'Project changed');
    await tx.query(
      'update conversations set project_id=null,version=version+1,updated_at=now() where project_id=$1 and owner_id=$2',
      [id, owner],
    );
    const docs = (
      await tx.query(
        'update documents set project_id=null,version=version+1,updated_at=now() where project_id=$1 and owner_id=$2 returning *',
        [id, owner],
      )
    ).rows;
    for (const doc of docs)
      await tx.query(
        'insert into document_revisions(owner_id,document_id,version,title,content) values($1,$2,$3,$4,$5)',
        [owner, doc.id, doc.version, doc.title, doc.content],
      );
    await tx.query(
      'update schedules set project_id=null,paused=true,version=version+1,updated_at=now() where project_id=$1 and owner_id=$2',
      [id, owner],
    );
    await tx.query('delete from projects where id=$1 and owner_id=$2', [id, owner]);
  });
}
export async function shareProjectFile(
  owner: string,
  project: string,
  file: string,
  remove = false,
) {
  return withOwner(owner, async (tx) => {
    await owned(tx, 'projects', project);
    const f = (
      await tx.query(
        "select f.id from files f join conversations c on c.id=f.conversation_id where f.id=$1 and f.status='ready'",
        [file],
      )
    ).rows[0];
    if (!f) throw new AppError(404, 'NOT_FOUND', 'Ready file not found');
    if (remove) await cancelFileConsumers(tx, owner, file);
    if (remove)
      await tx.query('delete from project_files where project_id=$1 and file_id=$2', [
        project,
        file,
      ]);
    else
      await tx.query(
        'insert into project_files(owner_id,project_id,file_id) values($1,$2,$3) on conflict do nothing',
        [owner, project, file],
      );
  });
}
export async function projectFiles(owner: string, project: string) {
  return withOwner(owner, async (tx) => {
    await owned(tx, 'projects', project);
    return (
      await tx.query(
        'select f.id,f.original_name as filename,f.detected_mime from project_files pf join files f on f.id=pf.file_id join conversations c on c.id=f.conversation_id where pf.project_id=$1',
        [project],
      )
    ).rows;
  });
}
export async function documentList(owner: string) {
  return withOwner(owner, async (tx) =>
    (await tx.query('select * from documents order by updated_at desc limit 100')).rows.map(
      workspaceDto,
    ),
  );
}
export async function saveDocument(
  owner: string,
  input: { title: string; content: string; project_id: string | null },
  id?: string,
  version?: number,
) {
  return withOwner(owner, async (tx) => {
    if (id) await owned(tx, 'documents', id, version);
    if (input.project_id) await owned(tx, 'projects', input.project_id);
    const row = id
      ? (
          await tx.query(
            'update documents set title=$2,content=$3,project_id=$4,version=version+1,updated_at=now() where id=$1 returning *',
            [id, input.title, input.content, input.project_id],
          )
        ).rows[0]
      : (
          await tx.query(
            'insert into documents(owner_id,title,content,project_id) values($1,$2,$3,$4) returning *',
            [owner, input.title, input.content, input.project_id],
          )
        ).rows[0];
    await tx.query(
      'insert into document_revisions(owner_id,document_id,version,title,content) values($1,$2,$3,$4,$5)',
      [owner, row!.id, row!.version, row!.title, row!.content],
    );
    return workspaceDto(row!);
  });
}
export async function editDocumentRange(
  owner: string,
  id: string,
  version: number,
  input: { start: number; end: number; expected: string; replacement: string },
) {
  return withOwner(owner, async (tx) => {
    const row = await owned(tx, 'documents', id, version);
    let content: string;
    try {
      content = replaceRange(
        String(row.content),
        input.start,
        input.end,
        input.expected,
        input.replacement,
      );
    } catch {
      throw new AppError(409, 'VERSION_CONFLICT', 'Selected text changed');
    }
    if (content.length > 200000) throw new AppError(422, 'VALIDATION_ERROR', 'Document too long');
    const updated = (
      await tx.query(
        'update documents set content=$2,version=version+1,updated_at=now() where id=$1 returning *',
        [id, content],
      )
    ).rows[0]!;
    await tx.query(
      'insert into document_revisions(owner_id,document_id,version,title,content) values($1,$2,$3,$4,$5)',
      [owner, id, updated.version, updated.title, content],
    );
    return workspaceDto(updated);
  });
}
export async function revisions(owner: string, id: string) {
  return withOwner(owner, async (tx) => {
    await owned(tx, 'documents', id);
    return (
      await tx.query(
        'select * from document_revisions where document_id=$1 order by version desc limit 100',
        [id],
      )
    ).rows.map(workspaceDto);
  });
}
export async function removeDocument(owner: string, id: string, version: number) {
  return withOwner(owner, async (tx) => {
    await owned(tx, 'documents', id, version);
    await tx.query('update run_sources set document_id=null,excerpt=null where document_id=$1', [
      id,
    ]);
    await tx.query('delete from documents where id=$1', [id]);
  });
}
export async function compactConversation(
  owner: string,
  id: string,
  version: number,
  note: string,
  through: string,
) {
  return withOwner(owner, async (tx) => {
    await owned(tx, 'conversations', id, version);
    if (
      (
        await tx.query(
          "select id from runs where conversation_id=$1 and status in ('queued','running','waiting_approval')",
          [id],
        )
      ).rowCount
    )
      throw new AppError(409, 'ACTIVE_RUN_EXISTS', 'Wait for the current task');
    if (through !== '0') {
      const boundary = (
        await tx.query('select seq from messages where conversation_id=$1 and seq=$2', [
          id,
          through,
        ])
      ).rows[0];
      const latest = (
        await tx.query(
          "select min(seq) as seq from messages where conversation_id=$1 and role='user' and seq=(select max(seq) from messages where conversation_id=$1 and role='user')",
          [id],
        )
      ).rows[0];
      if (!boundary || BigInt(through) >= BigInt(String(latest?.seq ?? 0)))
        throw new AppError(422, 'VALIDATION_ERROR', 'Keep the latest user turn in full');
    }
    await tx.query(
      'update conversations set context_note=$2,context_through_seq=$3,version=version+1,updated_at=now() where id=$1',
      [id, note, through],
    );
  });
}
export async function searchMessages(owner: string, query: string, offset: number) {
  return withOwner(owner, async (tx) => {
    const rows = await tx.query(
      `select m.id,m.conversation_id,m.seq,m.role,c.title,substring(m.content from greatest(1,strpos(lower(m.content),lower($1))-80) for 360) as snippet
 from messages m join conversations c on c.id=m.conversation_id
 where to_tsvector('simple',m.content) @@ websearch_to_tsquery('simple',$1) or strpos(lower(m.content),lower($1))>0
 order by m.created_at desc,m.id desc limit 30 offset $2`,
      [query, offset],
    );
    return rows.rows;
  });
}
export async function branchConversation(owner: string, messageId: string, text: string) {
  return withOwner(owner, async (tx) => {
    const m = (
      await tx.query(
        "select m.* from messages m join conversations c on c.id=m.conversation_id where m.id=$1 and m.role='user'",
        [messageId],
      )
    ).rows[0];
    if (!m) throw new AppError(404, 'NOT_FOUND', 'User message not found');
    const chat = await owned(tx, 'conversations', String(m.conversation_id));
    const id = randomUUID();
    await tx.query(
      `insert into conversations(id,owner_id,title,title_source,model_id,enabled_tools,project_id,research_mode,budget_usd)
 values($1,$2,$3,'manual',$4,$5,$6,$7,$8)`,
      [
        id,
        owner,
        `Branch: ${String(chat.title).slice(0, 51)}`,
        chat.model_id,
        chat.enabled_tools,
        chat.project_id,
        chat.research_mode,
        chat.budget_usd,
      ],
    );
    await tx.query(
      `insert into messages(owner_id,conversation_id,seq,role,content,status)
 select owner_id,$2,seq,role,content,status from messages where conversation_id=$1 and seq<$3 and status<>'pending' order by seq`,
      [m.conversation_id, id, m.seq],
    );
    return { conversation_id: id, draft: text, attachments_copied: false };
  });
}
export async function reviseApproval(
  owner: string,
  id: string,
  hash: string,
  args: unknown,
  preview: unknown,
) {
  return withOwner(owner, async (tx) => {
    const a = (await tx.query('select run_id from approvals where id=$1', [id])).rows[0];
    if (!a) throw new AppError(404, 'NOT_FOUND', 'Approval not found');
    const run = (
      await tx.query(
        'select r.* from runs r join conversations c on c.id=r.conversation_id where r.id=$1 for update of r',
        [a.run_id],
      )
    ).rows[0];
    const old = (
      await tx.query(
        'select a.*,t.name,t.ordinal,t.provider_call_id,t.integration_id from approvals a join tool_calls t on t.id=a.tool_call_id where a.id=$1 for update of a,t',
        [id],
      )
    ).rows[0]!;
    if (
      !run ||
      run.status !== 'waiting_approval' ||
      run.cancel_requested_at ||
      old.status !== 'pending' ||
      old.args_hash !== hash
    )
      throw new AppError(409, 'APPROVAL_ALREADY_DECIDED', 'Proposal changed or already decided');
    if (new Date(old.expires_at).getTime() <= Date.now())
      throw new AppError(410, 'APPROVAL_EXPIRED', 'Proposal expired');
    const grant = (
      await tx.query("select * from integrations where id=$1 and status='connected'", [
        old.integration_id,
      ])
    ).rows[0];
    const cap = String(old.name).includes('mail') ? 'gmail' : 'calendar';
    if (!grant || !grant.capabilities[cap])
      throw new AppError(422, 'INTEGRATION_REAUTH_REQUIRED', 'Reconnect the service');
    const snapshot = run.tool_snapshot as { googleSubject?: string };
    if (snapshot.googleSubject !== grant.google_subject)
      throw new AppError(409, 'VERSION_CONFLICT', 'Connected account changed');
    if (
      (await tx.query('select count(*)::int as count from tool_calls where run_id=$1', [run.id]))
        .rows[0]!.count >= 40
    )
      throw new AppError(422, 'VALIDATION_ERROR', 'Too many revisions');
    await tx.query("update approvals set status='cancelled',decided_at=now() where id=$1", [id]);
    await tx.query(
      "update tool_calls set status='cancelled',provider_call_id=provider_call_id||':replaced:'||id::text where id=$1",
      [old.tool_call_id],
    );
    const newHash = sha256((await import('@ai-chat/contracts')).canonicalJson(args));
    const tool = (
      await tx.query(
        `insert into tool_calls(owner_id,run_id,ordinal,provider_call_id,name,arguments,args_hash,integration_id,status,preview)
 values($1,$2,(select coalesce(max(ordinal),0)+1 from tool_calls where run_id=$2),$3,$4,$5,$6,$7,'waiting_approval',$8) returning id`,
        [owner, run.id, old.provider_call_id, old.name, args, newHash, old.integration_id, preview],
      )
    ).rows[0]!;
    const approval = (
      await tx.query(
        "insert into approvals(owner_id,run_id,tool_call_id,args_hash,status,expires_at) values($1,$2,$3,$4,'pending',$5) returning *",
        [owner, run.id, tool.id, newHash, old.expires_at],
      )
    ).rows[0]!;
    const checkpoint = run.checkpoint as {
      thread?: { tool_calls?: { id: string; function: { arguments: string } }[] }[];
    };
    for (const message of checkpoint.thread ?? [])
      for (const call of message.tool_calls ?? [])
        if (call.id === old.provider_call_id) call.function.arguments = JSON.stringify(args);
    await tx.query('update runs set checkpoint=$2,version=version+1,updated_at=now() where id=$1', [
      run.id,
      checkpoint,
    ]);
    await appendEvent(tx, owner, String(run.id), 'approval.revised', {
      previous_id: id,
      approval_id: approval.id,
    });
    return { id: approval.id, args_hash: newHash };
  });
}
export type ScheduleInput = {
  title: string;
  prompt: string;
  model_id: string;
  enabled_tools: ToolGroup[];
  project_id: string | null;
  timezone: string;
  local_time: string;
  weekday: number | null;
  budget_usd: string;
};

/** Revoke active consumers before removing a shared file or its original chat. */
export async function cancelFileConsumers(tx: Tx, owner: string, file: string) {
  const runs = await tx.query(
    `update runs r set cancel_requested_at=coalesce(r.cancel_requested_at,now()),status=case when r.status='waiting_approval' then 'queued' else r.status end,updated_at=now()
 where r.owner_id=$1 and r.status in ('queued','running','waiting_approval') and exists(
  select 1 from conversations c join project_files pf on pf.project_id=c.project_id and pf.owner_id=c.owner_id
  where c.id=r.conversation_id and pf.file_id=$2) returning r.id`,
    [owner, file],
  );
  for (const run of runs.rows) {
    await tx.query(
      "update approvals set status='cancelled' where run_id=$1 and consumed_at is null and status in ('pending','approved')",
      [run.id],
    );
    await tx.query("insert into outbox(owner_id,topic,payload) values($1,'run.execute',$2)", [
      owner,
      { runId: run.id },
    ]);
  }
}
