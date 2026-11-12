import { AppError, nextScheduleAt, meetingSlots } from '@ai-chat/contracts';
import {
  withOwner,
  withWorker,
  owned,
  requestReplay,
  messageRequestHash,
  workspaceDto,
  createMessageRun,
  type ScheduleInput,
} from '@ai-chat/database';
import { validateChatModel, modelCatalog } from './models.ts';
export async function listSchedules(owner: string) {
  return withOwner(owner, async (tx) =>
    (await tx.query('select * from schedules order by next_at limit 100')).rows.map(workspaceDto),
  );
}
export async function saveSchedule(owner: string, b: ScheduleInput) {
  let next: Date;
  try {
    next = nextScheduleAt(new Date(), b.timezone, b.local_time, b.weekday);
  } catch {
    throw new AppError(422, 'VALIDATION_ERROR', 'Invalid timezone or schedule');
  }
  const model = (await modelCatalog(owner)).find((m) => m.id === b.model_id);
  if (!model) throw new AppError(422, 'MODEL_UNAVAILABLE', 'Choose an available model');
  if (b.enabled_tools.length && !model.supports_tools)
    throw new AppError(422, 'MODEL_TOOLS_UNSUPPORTED', 'Model does not support tools');
  if (model.input_price_per_million_usd === null || model.output_price_per_million_usd === null)
    throw new AppError(422, 'VALIDATION_ERROR', 'Scheduled budgets require known model prices');
  return withOwner(owner, async (tx) => {
    if (b.project_id) await owned(tx, 'projects', b.project_id);
    const count = (await tx.query('select count(*)::int as count from schedules')).rows[0];
    if (Number(count?.count) >= 20)
      throw new AppError(422, 'VALIDATION_ERROR', 'Maximum 20 schedules');
    const row = (
      await tx.query(
        `insert into schedules(owner_id,title,prompt,model_id,enabled_tools,project_id,timezone,local_time,weekday,budget_usd,next_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
        [
          owner,
          b.title,
          b.prompt,
          b.model_id,
          b.enabled_tools,
          b.project_id,
          b.timezone,
          b.local_time,
          b.weekday,
          b.budget_usd,
          next,
        ],
      )
    ).rows[0]!;
    return workspaceDto(row);
  });
}
export async function pauseSchedule(owner: string, id: string, version: number, paused: boolean) {
  return withOwner(owner, async (tx) => {
    const s = await owned(tx, 'schedules', id, version);
    const next = nextScheduleAt(
      new Date(),
      String(s.timezone),
      String(s.local_time),
      s.weekday as number | null,
    );
    return workspaceDto(
      (
        await tx.query(
          'update schedules set paused=$2,next_at=$3,version=version+1,updated_at=now() where id=$1 returning *',
          [id, paused, next],
        )
      ).rows[0]!,
    );
  });
}
export async function deleteSchedule(owner: string, id: string, version: number) {
  return withOwner(owner, async (tx) => {
    await owned(tx, 'schedules', id, version);
    await tx.query('delete from schedules where id=$1', [id]);
  });
}
/** Claim due occurrences and create the destination before releasing the transaction. */
export async function maintainSchedules() {
  const candidates = await withWorker(
    async (tx) =>
      (
        await tx.query(
          `select s.id from schedules s join profiles p on p.id=s.owner_id where not s.paused and s.next_at<=now() and p.deletion_requested_at is null order by s.next_at limit 5`,
        )
      ).rows,
  );
  for (const candidate of candidates)
    await withWorker(async (tx) => {
      const s = (
        await tx.query(
          `select s.* from schedules s join profiles p on p.id=s.owner_id where s.id=$1 and not s.paused and s.next_at<=now() and p.deletion_requested_at is null for update of s skip locked`,
          [candidate.id],
        )
      ).rows[0];
      if (!s) return;
      let next: Date;
      try {
        next = nextScheduleAt(
          new Date(),
          String(s.timezone),
          String(s.local_time),
          s.weekday as number | null,
        );
      } catch {
        await tx.query(
          "update schedules set paused=true,last_error='INVALID_SCHEDULE',version=version+1,updated_at=now() where id=$1",
          [s.id],
        );
        await tx.query('insert into notices(owner_id,title) values($1,$2)', [
          s.owner_id,
          `${s.title}: invalid schedule; paused`,
        ]);
        return;
      }
      const waiting = await tx.query(
        "select id from schedule_occurrences where schedule_id=$1 and status='pending' limit 1",
        [s.id],
      );
      // Coalesce periods missed while a previous occurrence waits for quota.
      if (!waiting.rowCount) {
        const chat = (
          await tx.query(
            `insert into conversations(owner_id,title,title_source,model_id,enabled_tools,project_id,budget_usd) values($1,$2,'manual',$3,$4,$5,$6) returning id`,
            [s.owner_id, s.title, s.model_id, s.enabled_tools, s.project_id, s.budget_usd],
          )
        ).rows[0]!;
        await tx.query(
          'insert into schedule_occurrences(owner_id,schedule_id,due_at,conversation_id) values($1,$2,$3,$4) on conflict do nothing',
          [s.owner_id, s.id, s.next_at, chat.id],
        );
      }
      await tx.query(
        'update schedules set next_at=$2,last_error=null,version=version+1,updated_at=now() where id=$1',
        [s.id, next],
      );
    });
  // Occurrence-scoped idempotency deduplicates competing dispatchers and crash recovery.
  const pending = await withWorker(
    async (tx) =>
      (
        await tx.query(
          `select o.*,s.prompt,s.paused from schedule_occurrences o join schedules s on s.id=o.schedule_id join profiles p on p.id=o.owner_id where o.status='pending' and not s.paused and p.deletion_requested_at is null order by o.created_at limit 10`,
        )
      ).rows,
  );
  for (const o of pending) {
    if (o.paused) continue;
    try {
      const owner = String(o.owner_id),
        chat = String(o.conversation_id);
      // Recover the durable run even after the 24-hour idempotency record expires.
      const existing = await withWorker(
        async (tx) =>
          (
            await tx.query(
              'select r.id from runs r join messages m on m.id=r.user_message_id where m.client_message_id=$1 and r.owner_id=$2',
              [o.id, owner],
            )
          ).rows[0],
      );
      if (existing) {
        await withWorker((tx) =>
          tx.query(
            "update schedule_occurrences set status='queued',run_id=$2 where id=$1 and status='pending'",
            [o.id, existing.id],
          ),
        );
        continue;
      }
      // createMessageRun is idempotent for this occurrence, including competing dispatchers.
      const replay = await requestReplay(
        owner,
        'POST /messages',
        String(o.id),
        messageRequestHash(chat, {
          clientMessageId: String(o.id),
          text: String(o.prompt),
          fileIds: [],
        }),
      );
      if (replay) {
        const body = replay.body as { run: { id: string } };
        await withWorker((tx) =>
          tx.query(
            "update schedule_occurrences set status='queued',run_id=$2 where id=$1 and status='pending'",
            [o.id, body.run.id],
          ),
        );
        continue;
      }
      const meta = await validateChatModel(owner, chat);
      const created = await createMessageRun(owner, chat, String(o.id), {
        clientMessageId: String(o.id),
        text: String(o.prompt),
        fileIds: [],
        ...meta,
        scheduleOccurrenceId: String(o.id),
      });
      await withWorker((tx) =>
        tx.query(
          "update schedule_occurrences set status='queued',run_id=$2 where id=$1 and status='pending'",
          [o.id, created.body.run.id],
        ),
      );
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'PROVIDER_UNAVAILABLE';
      if (
        ['USER_RUN_LIMIT', 'RATE_LIMITED', 'REQUEST_IN_PROGRESS', 'SCHEDULE_INACTIVE'].includes(
          code,
        )
      )
        continue;
      await withWorker(async (tx) => {
        await tx.query(
          "update schedule_occurrences set status='failed',error_code=$2 where id=$1 and status='pending'",
          [o.id, code],
        );
        await tx.query(
          'update schedules set paused=true,last_error=$2,version=version+1 where id=$1',
          [o.schedule_id, code],
        );
        await tx.query('insert into notices(owner_id,title) values($1,$2)', [
          o.owner_id,
          `Scheduled task paused: ${code}`,
        ]);
      });
    }
  }
  await withWorker(async (tx) => {
    const rows = (
      await tx.query(
        `select o.id,o.owner_id,o.run_id,r.status,s.title from schedule_occurrences o join runs r on r.id=o.run_id join schedules s on s.id=o.schedule_id where o.status not in ('completed','cancelled','failed') and r.status in ('completed','cancelled','failed','waiting_approval') and o.status<>r.status for update of o skip locked limit 50`,
      )
    ).rows;
    for (const row of rows) {
      await tx.query('update schedule_occurrences set status=$2 where id=$1', [row.id, row.status]);
      await tx.query(
        'insert into notices(owner_id,run_id,title) values($1,$2,$3) on conflict do nothing',
        [row.owner_id, row.run_id, `${row.title}: ${row.status}`],
      );
    }
  });
}
export async function suggestMeetingSlots(
  owner: string,
  input: Parameters<typeof meetingSlots>[0],
) {
  // Read the current grant directly; this endpoint never writes or guesses attendee availability.
  const { currentCalendarAvailability } = await import('./google.ts');
  const busy = await currentCalendarAvailability(owner, input);
  try {
    return {
      slots: meetingSlots(input, busy.busy),
      timezone: input.timezone,
      calendar: 'primary',
      attendee_availability: 'not_checked',
    };
  } catch {
    throw new AppError(422, 'VALIDATION_ERROR', 'Invalid availability or date range');
  }
}
