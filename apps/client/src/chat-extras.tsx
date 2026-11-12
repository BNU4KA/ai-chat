import { useEffect, useState, useRef } from 'react';
import { BackHandler, Platform, ScrollView, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { workflowPrompts } from '@ai-chat/contracts';
import { useTheme } from './theme';
import { useCredential } from './queries';
import { api, json } from './api';
import { Button, Copy, Field, Panel, ErrorNotice, Choice, TabBar } from './ui';
import { DocumentEditor, useProjects, useDocuments, type Document } from './workspace';
import type { Conversation, Message, Run } from './types';
export function ChatExtras({
  chat,
  messages,
  draft,
  fileIds,
  onDraft,
  running,
  documentSeed,
  onOpenChange,
}: {
  chat?: Conversation;
  messages: Message[];
  draft: string;
  fileIds: string[];
  onDraft: (s: string) => void;
  running: boolean;
  documentSeed?: { text: string; key: string };
  onOpenChange?: (open: boolean) => void;
}) {
  const dimensions = useWindowDimensions(),
    wide = dimensions.width >= 1024,
    { colors: c } = useTheme();
  const router = useRouter(),
    cache = useQueryClient(),
    projects = useProjects(),
    docs = useDocuments();
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState('context'),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(''),
    [through, setThrough] = useState('0'),
    [budget, setBudget] = useState(''),
    [doc, setDoc] = useState<Document | null>(null),
    [estimate, setEstimate] = useState<Record<string, unknown> | null>(null);
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone),
    [duration, setDuration] = useState('30'),
    [buffer, setBuffer] = useState('15'),
    [workStart, setWorkStart] = useState('9'),
    [workEnd, setWorkEnd] = useState('18'),
    [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  useEffect(() => {
    setNote(chat?.context_note ?? '');
    setThrough(chat?.context_through_seq ?? '0');
    setBudget(chat?.budget_usd ?? '');
  }, [chat?.id, chat?.version, chat?.context_note, chat?.context_through_seq, chat?.budget_usd]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  useEffect(() => {
    if (!open) return;
    if (Platform.OS === 'web') {
      const close = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
        }
      };
      window.addEventListener('keydown', close);
      return () => window.removeEventListener('keydown', close);
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [open]);
  function draftAndClose(text: string) {
    onDraft(text);
    setOpen(false);
  }
  const credential = useCredential();
  const contextAdvice = useQuery({
    queryKey: ['context-advice', chat?.id, chat?.version, messages.at(-1)?.id, running],
    queryFn: () =>
      api<{ input_tokens_estimated: number; context_length: number | null }>(
        `/v1/conversations/${chat!.id}/estimate`,
        json('POST', { text: '', file_ids: [] }),
      ),
    enabled: !!chat && !running && !!credential.data?.configured,
    staleTime: 30000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const lastSaved = useRef('');
  useEffect(() => {
    if (!documentSeed || lastSaved.current === documentSeed.key) return;
    lastSaved.current = documentSeed.key;
    setBusy(true);
    void api<Document>(
      '/v1/documents',
      json('POST', {
        title: 'Saved response',
        content: documentSeed.text,
        project_id: chat?.project_id ?? null,
      }),
    )
      .then((d) => {
        {
          setDoc(d);
          setTab('documents');
          setOpen(true);
          void cache.invalidateQueries({ queryKey: ['documents'] });
        }
      })
      .catch(setError)
      .finally(() => setBusy(false));

    // A new save request must create exactly one document, independent of chat refetches.
  }, [documentSeed?.key]);
  async function patch(body: unknown) {
    if (!chat) return;
    const value = await api<Conversation>(
      `/v1/conversations/${chat.id}`,
      json('PATCH', body, chat.version),
    );
    cache.setQueryData(['conversation', chat.id], value);
    await cache.invalidateQueries({ queryKey: ['conversations'] });
  }
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: open ? 12 : 0,
        paddingBottom: 6,
        gap: 8,
        ...(open
          ? {
              position: 'absolute',
              top: 72,
              bottom: 0,
              right: 0,
              ...(wide ? { width: 420 } : { left: 0 }),
              zIndex: 25,
              backgroundColor: c.background,
              borderLeftWidth: wide ? 1 : 0,
              borderColor: c.border,
            }
          : {}),
      }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Button secondary onPress={() => setOpen(!open)}>
          {open ? 'Close work tools' : 'Work tools'}
        </Button>
        <Button secondary onPress={() => router.setParams({ panel: 'workspace', document: '' })}>
          Projects & tasks
        </Button>
        {chat?.project_id && (
          <Copy small>
            {projects.data?.find((p) => p.id === chat.project_id)?.name ?? 'Project'}
          </Copy>
        )}
        {chat?.context_note && <Copy small>Reviewed context note is active</Copy>}
      </View>
      {!open &&
        contextAdvice.data?.context_length &&
        contextAdvice.data.input_tokens_estimated > contextAdvice.data.context_length * 0.7 && (
          <Panel>
            <Copy small>
              This conversation is getting long. Review a context note to keep room for the next
              answer.
            </Copy>
            <Button
              secondary
              onPress={() => {
                setTab('context');
                setOpen(true);
              }}
            >
              Review context
            </Button>
          </Panel>
        )}
      {open && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
          <TabBar
            label="Work tools sections"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'context', label: 'Context & project' },
              { value: 'documents', label: 'Documents' },
              { value: 'workflows', label: 'Workflows' },
              { value: 'budget', label: 'Cost & limits' },
              { value: 'meetings', label: 'Meeting times' },
            ]}
          />
          <ErrorNotice error={error} />
          {tab === 'context' && (
            <Panel>
              <Copy>Project context</Copy>
              <Choice
                disabled={!chat || running || busy}
                selected={!chat?.project_id}
                onPress={() => void act(() => patch({ project_id: null }))}
              >
                No project
              </Choice>
              {projects.data?.map((p) => (
                <Choice
                  key={p.id}
                  disabled={!chat || running || busy}
                  selected={chat?.project_id === p.id}
                  onPress={() => void act(() => patch({ project_id: p.id }))}
                >
                  {p.name}
                </Choice>
              ))}
              {!chat && <Copy small>Send a first message to attach this chat to a project.</Copy>}
              <Copy>Reviewed context note</Copy>
              <Copy small muted>
                Keep goals, constraints, decisions and open questions. Messages through the selected
                boundary are replaced by this note in future model requests; originals remain in
                history. Keep the latest turn in full.
              </Copy>
              <Button
                secondary
                disabled={!messages.length}
                onPress={() => {
                  const lastUser = messages.filter((m) => m.role === 'user').at(-1);
                  const older = messages.filter(
                    (m) => BigInt(m.seq) < BigInt(lastUser?.seq ?? '0') && m.status !== 'pending',
                  );
                  setThrough(older.at(-1)?.seq ?? '0');
                  setNote(
                    older
                      .slice(-20)
                      .map((m) => `${m.role}: ${m.content.slice(0, 900)}`)
                      .join('\n\n')
                      .slice(0, 22000),
                  );
                }}
              >
                Prepare excerpts for review
              </Button>
              <Field
                accessibilityLabel="Reviewed context note"
                placeholder="Review and edit the context to retain"
                multiline
                value={note}
                onChangeText={setNote}
                style={{ minHeight: 150, textAlignVertical: 'top' }}
              />
              <Field
                accessibilityLabel="Context boundary sequence"
                placeholder="Last covered message sequence"
                value={through}
                onChangeText={setThrough}
                keyboardType="number-pad"
              />
              <Button
                disabled={!chat || running || busy || !note.trim()}
                onPress={() =>
                  void act(async () => {
                    await api(
                      `/v1/conversations/${chat!.id}/compact`,
                      json('POST', { note, through_seq: through }, chat!.version),
                    );
                    await cache.invalidateQueries({ queryKey: ['conversation', chat!.id] });
                  })
                }
              >
                Use reviewed note
              </Button>
              {chat?.context_note && (
                <Button
                  secondary
                  disabled={running || busy}
                  onPress={() =>
                    void act(async () => {
                      await api(
                        `/v1/conversations/${chat.id}/compact`,
                        json('DELETE', undefined, chat.version),
                      );
                      await cache.invalidateQueries({ queryKey: ['conversation', chat.id] });
                    })
                  }
                >
                  Restore full context
                </Button>
              )}
            </Panel>
          )}
          {tab === 'documents' && (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {docs.data?.map((d) => (
                  <Button key={d.id} secondary onPress={() => setDoc(d)}>
                    {d.title}
                  </Button>
                ))}
              </View>
              {doc ? (
                <DocumentEditor
                  key={doc.id}
                  document={doc}
                  onSaved={setDoc}
                  onRefine={draftAndClose}
                />
              ) : (
                <Copy>Save a response as a document or create one in Projects & tasks.</Copy>
              )}
            </>
          )}
          {tab === 'workflows' && (
            <Panel>
              {Object.entries(workflowPrompts).map(([key, prompt]) => (
                <Button key={key} secondary onPress={() => draftAndClose(prompt)}>
                  {
                    {
                      meeting: 'Prepare for a meeting',
                      research: 'Compare and research',
                      day: 'Plan my day',
                      weekly: 'Weekly review',
                    }[key]!
                  }
                </Button>
              ))}
              <Copy small muted>
                Review the instruction and enable the needed tools before sending.
              </Copy>
              <Button
                secondary
                disabled={!chat || running || busy}
                onPress={() => void act(() => patch({ research_mode: !chat?.research_mode }))}
              >
                {chat?.research_mode ? 'Research mode: on' : 'Research mode: off'}
              </Button>
            </Panel>
          )}
          {tab === 'budget' && (
            <Panel>
              <Field
                accessibilityLabel="Run budget USD"
                placeholder="Maximum estimated USD per run (empty: no cap)"
                value={budget}
                onChangeText={setBudget}
                keyboardType="decimal-pad"
              />
              <Button
                disabled={!chat || running || busy}
                onPress={() => void act(() => patch({ budget_usd: budget.trim() || null }))}
              >
                Save run budget
              </Button>
              <Button
                secondary
                disabled={!chat || busy}
                onPress={() =>
                  void act(async () =>
                    setEstimate(
                      await api(
                        `/v1/conversations/${chat!.id}/estimate`,
                        json('POST', { text: draft, file_ids: fileIds }),
                      ),
                    ),
                  )
                }
              >
                Estimate current draft
              </Button>
              {estimate && (
                <>
                  <Copy small>
                    Estimated input: {String(estimate.input_tokens_estimated)} tokens · context{' '}
                    {String(estimate.context_length ?? 'unknown')}
                  </Copy>
                  <Copy small>
                    Estimated first response: ${String(estimate.cost_usd_estimated ?? 'unknown')}
                  </Copy>
                </>
              )}
              <Copy small muted>
                Draft estimates exclude tool results and project material. The worker checks each
                model request with its current context before submission. Provider charges may
                differ from catalog estimates. Unknown prices block capped tasks.
              </Copy>
            </Panel>
          )}
          {tab === 'meetings' && (
            <Panel>
              <Copy>Find free time on your primary calendar</Copy>
              <Field
                accessibilityLabel="Meeting search start"
                placeholder="Start, with timezone offset: 2026-11-12T09:00:00+01:00"
                value={from}
                onChangeText={setFrom}
              />
              <Field
                accessibilityLabel="Meeting search end"
                placeholder="End, with timezone offset"
                value={to}
                onChangeText={setTo}
              />
              <Field
                accessibilityLabel="Meeting timezone"
                placeholder="Timezone"
                value={timezone}
                onChangeText={setTimezone}
              />
              <Field
                accessibilityLabel="Meeting duration minutes"
                placeholder="Duration in minutes"
                value={duration}
                onChangeText={setDuration}
              />
              <Field
                accessibilityLabel="Meeting buffer minutes"
                placeholder="Buffer in minutes"
                value={buffer}
                onChangeText={setBuffer}
              />
              <Field
                accessibilityLabel="Working day start hour"
                placeholder="Working day starts at hour"
                value={workStart}
                onChangeText={setWorkStart}
              />
              <Field
                accessibilityLabel="Working day end hour"
                placeholder="Working day ends at hour"
                value={workEnd}
                onChangeText={setWorkEnd}
              />
              <Button
                disabled={busy || !from || !to}
                onPress={() =>
                  void act(async () => {
                    const result = await api<{ slots: { start: string; end: string }[] }>(
                      '/v1/meetings/slots',
                      json('POST', {
                        time_min: from,
                        time_max: to,
                        timezone,
                        duration_minutes: Number(duration),
                        buffer_minutes: Number(buffer),
                        work_start: Number(workStart),
                        work_end: Number(workEnd),
                      }),
                    );
                    setSlots(result.slots);
                  })
                }
              >
                Find meeting times
              </Button>
              <Copy small muted>
                Checks your calendar only. Attendee availability is not checked. Creating a meeting
                requires a separate confirmation.
              </Copy>
              {slots.map((s) => (
                <Button
                  key={s.start}
                  secondary
                  onPress={() =>
                    draftAndClose(
                      `Prepare a calendar event from ${s.start} to ${s.end}, timezone ${timezone}. Ask me for the title and participants before proposing the action.`,
                    )
                  }
                >
                  {new Date(s.start).toLocaleString(undefined, { timeZone: timezone })}
                </Button>
              ))}
            </Panel>
          )}
        </ScrollView>
      )}
    </View>
  );
}
export function PassageActions({
  text,
  onDraft,
  onSave,
}: {
  text: string;
  onDraft: (s: string) => void;
  onSave: () => void;
}) {
  const [open, setOpen] = useState(false),
    [passage, setPassage] = useState('');
  function choose() {
    if (Platform.OS === 'web') {
      const selected = window.getSelection()?.toString();
      if (selected && text.includes(selected)) setPassage(selected);
    }
    setOpen(!open);
  }
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Button secondary quiet onPress={choose}>
          Work with response
        </Button>
        <Button secondary quiet onPress={onSave}>
          Save as document
        </Button>
      </View>
      {open && (
        <>
          <Field
            accessibilityLabel="Selected response passage"
            placeholder="Select or paste the passage to work with"
            multiline
            value={passage}
            onChangeText={setPassage}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {['Explain', 'Shorten', 'Check'].map((action) => (
              <Button
                key={action}
                secondary
                onPress={() =>
                  onDraft(
                    `${action} the following passage${action === 'Check' ? ' using sources; distinguish supported claims, contradictions and uncertainty' : ''}:\n\n${passage.trim() || text}`,
                  )
                }
              >
                {action}
              </Button>
            ))}
          </View>
          <Copy small muted>
            Creates a draft. Review before sending.
          </Copy>
        </>
      )}
    </View>
  );
}
export function RunUsage({ run }: { run?: Run }) {
  return run ? (
    <Copy small muted>
      Input {run.usage.input_tokens ?? '?'} · output {run.usage.output_tokens ?? '?'} tokens ·{' '}
      {run.usage.cost_status} cost{' '}
      {run.usage.cost_usd == null ? 'unknown' : `$${run.usage.cost_usd}`}
    </Copy>
  ) : null;
}
