import { transferDraft } from './draft-transfer';
import { useEffect, useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Dialog } from './dialog';
import { ModelList } from './model-list';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  workflowPrompts,
  type z,
  type projectSchema,
  type documentSchema,
  type scheduleSchema,
} from '@ai-chat/contracts';
import { api, authorizedFetch, json } from './api';
import { Button, Copy, ErrorNotice, Field, Panel, Choice, TabBar } from './ui';
import { Markdown } from './markdown';
import { useModels, useCredential, useProfile, useCapabilities } from './queries';
import { useLocale } from './locale';
export type Project = z.infer<typeof projectSchema>;
export type Document = z.infer<typeof documentSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/v1/projects') });
}
export function useDocuments() {
  return useQuery({ queryKey: ['documents'], queryFn: () => api<Document[]>('/v1/documents') });
}
export async function exportDocument(doc: Document, format: 'md' | 'html') {
  const response = await authorizedFetch(`/v1/documents/${doc.id}/export?format=${format}`);
  const text = await response.text();
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(
      new Blob([text], { type: format === 'html' ? 'text/html' : 'text/markdown' }),
    );
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[^\p{L}\p{N} ._-]/gu, '_')}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else await Share.share({ title: doc.title, message: text });
}
export function DocumentEditor({
  document: doc,
  onSaved,
  onRefine,
}: {
  document: Document;
  onSaved: (doc: Document) => void;
  onRefine?: (prompt: string) => void;
}) {
  const [title, setTitle] = useState(doc.title),
    [content, setContent] = useState(doc.content),
    [preview, setPreview] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 }),
    [replacement, setReplacement] = useState(''),
    [instruction, setInstruction] = useState('');
  const [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [showVersions, setShowVersions] = useState(false);
  const cache = useQueryClient();
  useEffect(() => {
    setTitle(doc.title);
    setContent(doc.content);
    setSelection({ start: 0, end: 0 });
  }, [doc.id, doc.version, doc.title, doc.content]);
  const versions = useQuery({
    queryKey: ['document-versions', doc.id, doc.version],
    queryFn: () => api<(Document & { document_id: string })[]>(`/v1/documents/${doc.id}/revisions`),
    enabled: showVersions,
  });
  async function save(range = false) {
    setBusy(true);
    setError(null);
    try {
      const updated = await api<Document>(
        range ? `/v1/documents/${doc.id}/replace` : `/v1/documents/${doc.id}`,
        json(
          range ? 'POST' : 'PATCH',
          range
            ? {
                ...selection,
                expected: doc.content.slice(selection.start, selection.end),
                replacement,
              }
            : { title, content, project_id: doc.project_id },
          doc.version,
        ),
      );
      onSaved(updated);
      setReplacement('');
      await cache.invalidateQueries({ queryKey: ['documents'] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel testID="document-editor">
      <Copy>Document · version {doc.version}</Copy>
      <Field accessibilityLabel="Document title" value={title} onChangeText={setTitle} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button quiet secondary onPress={() => setPreview(!preview)}>
          {preview ? 'Edit' : 'Preview'}
        </Button>
        <Button disabled={busy} onPress={() => void save()}>
          Save version
        </Button>
        <Button quiet secondary onPress={() => setShowVersions(!showVersions)}>
          Versions
        </Button>
        <Button quiet secondary onPress={() => void exportDocument(doc, 'md').catch(setError)}>
          Export Markdown
        </Button>
        <Button quiet secondary onPress={() => void exportDocument(doc, 'html').catch(setError)}>
          Export HTML
        </Button>
      </View>
      {preview ? (
        <Markdown text={content} />
      ) : (
        <Field
          accessibilityLabel="Document content"
          multiline
          value={content}
          onChangeText={setContent}
          onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
          style={{ minHeight: 220, maxHeight: 420, textAlignVertical: 'top', borderRadius: 16 }}
        />
      )}
      {selection.end > selection.start && (
        <>
          <Copy small>Selected passage</Copy>
          <Copy translate={false}>{content.slice(selection.start, selection.end)}</Copy>
          <Field
            accessibilityLabel="Replace selected passage"
            placeholder="Replacement text"
            multiline
            value={replacement}
            onChangeText={setReplacement}
          />
          <Button
            secondary
            disabled={busy || content !== doc.content}
            onPress={() => void save(true)}
          >
            Replace selection and save
          </Button>
        </>
      )}
      {onRefine && (
        <>
          <Field
            accessibilityLabel="Document revision instruction"
            placeholder="How should the selected passage or document change?"
            value={instruction}
            onChangeText={setInstruction}
          />
          <Button
            secondary
            disabled={!instruction.trim()}
            onPress={() =>
              onRefine(
                `Revise the following ${selection.end > selection.start ? 'selected passage' : 'document'} according to my instruction. Return only the revised text.\nInstruction: ${instruction}\n\n${selection.end > selection.start ? content.slice(selection.start, selection.end) : content}`,
              )
            }
          >
            Prepare revision in chat
          </Button>
          <Copy small muted>
            Review the answer, then paste it into the document or selection replacement. Sending
            uses the selected model.
          </Copy>
        </>
      )}
      {showVersions &&
        versions.data?.map((v) => (
          <Button
            key={v.version}
            secondary
            onPress={() => {
              setTitle(v.title);
              setContent(v.content);
              setPreview(false);
            }}
          >
            Load version {v.version} into editor
          </Button>
        ))}
      <ErrorNotice error={error ?? versions.error} />
    </Panel>
  );
}
export function WorkspacePage() {
  const params = useLocalSearchParams<{ document?: string }>();
  const router = useRouter(),
    cache = useQueryClient(),
    { language } = useLocale();
  const [tab, setTab] = useState('projects'),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const projects = useProjects(),
    documents = useDocuments(),
    credential = useCredential(),
    models = useModels(!!credential.data?.configured),
    profile = useProfile(),
    caps = useCapabilities();
  const schedules = useQuery({
    queryKey: ['schedules'],
    queryFn: () => api<Schedule[]>('/v1/schedules'),
    refetchInterval: 10000,
  });
  const notices = useQuery({
    queryKey: ['notices'],
    queryFn: () =>
      api<{ id: string; title: string; conversation_id?: string; read_at: string | null }[]>(
        '/v1/notices',
      ),
    refetchInterval: 10000,
  });
  const [project, setProject] = useState<Project | null>(null),
    [name, setName] = useState(''),
    [memory, setMemory] = useState('');
  const [doc, setDoc] = useState<Document | null>(null),
    [docTitle, setDocTitle] = useState('');
  const [modelDialog, setModelDialog] = useState(false),
    [modelSearch, setModelSearch] = useState('');
  const sourceDocument = useQuery({
    queryKey: ['document', params.document],
    queryFn: () => api<Document>(`/v1/documents/${params.document}`),
    enabled: !!params.document,
  });
  useEffect(() => {
    if (sourceDocument.data) {
      setDoc(sourceDocument.data);
      setTab('documents');
    }
  }, [sourceDocument.data]);
  const [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [offset, setOffset] = useState(0);
  const results = useQuery({
    queryKey: ['message-search', search, offset],
    queryFn: () =>
      api<{ id: string; conversation_id: string; title: string; snippet: string }[]>(
        `/v1/search/messages?query=${encodeURIComponent(search)}&offset=${offset}`,
      ),
    enabled: !!search,
  });
  const [scheduleTitle, setScheduleTitle] = useState(''),
    [prompt, setPrompt] = useState(''),
    [time, setTime] = useState('09:00'),
    [timezone, setTimezone] = useState('Europe/Warsaw'),
    [weekday, setWeekday] = useState(''),
    [budget, setBudget] = useState('0.10'),
    [model, setModel] = useState(''),
    [tools, setTools] = useState<string[]>([]),
    [scheduleProject, setScheduleProject] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState('');
  const scheduleHistory = useQuery({
    queryKey: ['schedule-history', historyId],
    queryFn: () =>
      api<
        {
          id: string;
          due_at: string;
          status: string;
          error_code?: string;
          conversation_id?: string;
        }[]
      >(`/v1/schedules/${historyId}/history`),
    enabled: !!historyId,
    refetchInterval: 10000,
  });
  useEffect(() => {
    if (profile.data) setTimezone(profile.data.timezone);
  }, [profile.data]);
  const [shareChat, setShareChat] = useState('');
  const chats = useQuery({
    queryKey: ['project-share-chats'],
    queryFn: () => api<{ id: string; title: string }[]>('/v1/conversations?limit=100'),
    enabled: !!project,
  });
  const chatFiles = useQuery({
    queryKey: ['share-files', shareChat],
    queryFn: () =>
      api<{ id: string; filename: string; status: string; detected_mime: string | null }[]>(
        `/v1/conversations/${shareChat}/files`,
      ),
    enabled: !!shareChat,
  });
  const shares = useQuery({
    queryKey: ['project-files', project?.id],
    queryFn: () => api<{ id: string; filename: string }[]>(`/v1/projects/${project!.id}/files`),
    enabled: !!project,
  });
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
  return (
    <View style={{ gap: 16 }}>
      <TabBar
        label="Workspace sections"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'projects', label: 'Projects' },
          { value: 'documents', label: 'Documents' },
          { value: 'search', label: 'Search messages' },
          { value: 'schedules', label: 'Scheduled tasks' },
          { value: 'notifications', label: 'Notifications' },
        ]}
      />
      <ErrorNotice error={error ?? projects.error ?? documents.error ?? sourceDocument.error} />
      {tab === 'projects' && (
        <>
          <Copy>
            Keep goals, decisions and shared files together. Chats use project memory only after you
            attach them to that project.
          </Copy>
          <Button
            secondary
            onPress={() => {
              setProject(null);
              setName('');
              setMemory('');
            }}
          >
            New project
          </Button>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {projects.data?.map((p) => (
              <Choice
                key={p.id}
                selected={p.id === project?.id}
                onPress={() => {
                  setProject(p);
                  setName(p.name);
                  setMemory(p.memory);
                  setShareChat('');
                }}
              >
                {p.name}
              </Choice>
            ))}
          </View>
          <Panel>
            <Field
              accessibilityLabel="Project name"
              placeholder="Project name"
              value={name}
              onChangeText={setName}
            />
            <Field
              accessibilityLabel="Project memory"
              placeholder="Goals, constraints, decisions and open questions"
              multiline
              value={memory}
              onChangeText={setMemory}
              style={{ minHeight: 180, textAlignVertical: 'top' }}
            />
            <Button
              disabled={busy || !name.trim()}
              onPress={() =>
                void act(async () => {
                  const p = await api<Project>(
                    project ? `/v1/projects/${project.id}` : '/v1/projects',
                    json(project ? 'PATCH' : 'POST', { name, memory }, project?.version),
                  );
                  setProject(p);
                  await cache.invalidateQueries({ queryKey: ['projects'] });
                })
              }
            >
              Save project
            </Button>
            {project && (
              <>
                <Button
                  secondary
                  onPress={() => router.push({ pathname: '/', params: { project: project.id } })}
                >
                  New chat in project
                </Button>
                <Button
                  danger
                  disabled={busy}
                  onPress={() =>
                    void act(async () => {
                      await api(
                        `/v1/projects/${project.id}`,
                        json('DELETE', undefined, project.version),
                      );
                      setProject(null);
                      setName('');
                      setMemory('');
                      await cache.invalidateQueries({ queryKey: ['projects'] });
                    })
                  }
                >
                  Remove project, keep chats and documents
                </Button>
              </>
            )}
          </Panel>
          {project && (
            <Panel>
              <Copy>Explicitly shared files</Copy>
              <Copy small muted>
                Removing a share stops future project reads. Deleting the original file or chat also
                revokes access. Photos must be attached to the chat for visual analysis.
              </Copy>
              {shares.data?.map((f) => (
                <View key={f.id}>
                  <Copy translate={false}>{f.filename}</Copy>
                  <Button
                    secondary
                    onPress={() =>
                      void act(async () => {
                        await api(
                          `/v1/projects/${project.id}/files`,
                          json('POST', { file_id: f.id, remove: true }),
                        );
                        await shares.refetch();
                      })
                    }
                  >
                    Remove share
                  </Button>
                </View>
              ))}
              <Copy small>Choose the original chat</Copy>
              {chats.data?.map((c) => (
                <Button
                  key={c.id}
                  secondary={shareChat !== c.id}
                  onPress={() => setShareChat(c.id)}
                >
                  {c.title}
                </Button>
              ))}
              {chatFiles.data
                ?.filter((f) => f.status === 'ready')
                .map((f) => (
                  <Button
                    key={f.id}
                    secondary
                    disabled={busy || shares.data?.some((s) => s.id === f.id)}
                    onPress={() =>
                      void act(async () => {
                        await api(
                          `/v1/projects/${project.id}/files`,
                          json('POST', { file_id: f.id }),
                        );
                        await shares.refetch();
                      })
                    }
                  >
                    Share {f.filename}
                  </Button>
                ))}
            </Panel>
          )}
        </>
      )}
      {tab === 'documents' && (
        <>
          <Panel>
            <Field
              accessibilityLabel="New document title"
              placeholder="Document title"
              value={docTitle}
              onChangeText={setDocTitle}
            />
            <Button
              disabled={busy || !docTitle.trim()}
              onPress={() =>
                void act(async () => {
                  setDoc(
                    await api<Document>(
                      '/v1/documents',
                      json('POST', {
                        title: docTitle,
                        content: '',
                        project_id: project?.id ?? null,
                      }),
                    ),
                  );
                  setDocTitle('');
                  await cache.invalidateQueries({ queryKey: ['documents'] });
                })
              }
            >
              Create document
            </Button>
          </Panel>
          {documents.data?.map((d) => (
            <Button key={d.id} secondary onPress={() => setDoc(d)}>
              {d.title} · v{d.version}
            </Button>
          ))}
          {doc && (
            <>
              <DocumentEditor
                key={doc.id}
                document={doc}
                onSaved={setDoc}
                onRefine={(draft) => {
                  if (profile.data?.id) transferDraft(profile.data.id, 'home', draft);
                  router.push('/');
                }}
              />
              <Button
                danger
                disabled={busy}
                onPress={() =>
                  void act(async () => {
                    await api(`/v1/documents/${doc.id}`, json('DELETE', undefined, doc.version));
                    setDoc(null);
                    await cache.invalidateQueries({ queryKey: ['documents'] });
                  })
                }
              >
                Delete document and versions
              </Button>
            </>
          )}
        </>
      )}
      {tab === 'search' && (
        <>
          <Field
            accessibilityLabel="Search message content"
            placeholder="Search all message text"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => {
              setSearch(query.trim());
              setOffset(0);
            }}
          />
          <Button
            disabled={!query.trim()}
            onPress={() => {
              setSearch(query.trim());
              setOffset(0);
            }}
          >
            Search messages
          </Button>
          <ErrorNotice error={results.error} />
          {results.data?.map((r) => (
            <Panel key={r.id}>
              <Copy>{r.title}</Copy>
              <Copy translate={false}>{r.snippet}</Copy>
              <Button
                secondary
                onPress={() =>
                  router.push({
                    pathname: '/chat/[id]',
                    params: { id: r.conversation_id, message: r.id },
                  })
                }
              >
                Open matching message
              </Button>
            </Panel>
          ))}
          {results.data?.length === 0 && <Copy>No matching messages.</Copy>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {offset > 0 && (
              <Button secondary onPress={() => setOffset(Math.max(0, offset - 30))}>
                Previous results
              </Button>
            )}
            {results.data?.length === 30 && (
              <Button secondary onPress={() => setOffset(offset + 30)}>
                More results
              </Button>
            )}
          </View>
        </>
      )}
      {tab === 'schedules' && (
        <>
          <Copy>
            Runs continue on the server. Results and confirmation requests appear in Notifications.
            External actions still need your approval.
          </Copy>
          <Panel>
            <Field
              accessibilityLabel="Scheduled task title"
              placeholder="Task title"
              value={scheduleTitle}
              onChangeText={setScheduleTitle}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(workflowPrompts).map(([key, value]) => (
                <Button key={key} secondary onPress={() => setPrompt(value)}>
                  {
                    {
                      meeting: 'Prepare for a meeting',
                      research: 'Compare and research',
                      day: 'Plan my day',
                      weekly: 'Weekly review',
                    }[key]
                  }
                </Button>
              ))}
            </View>
            <Field
              accessibilityLabel="Scheduled task instruction"
              placeholder="What should the assistant do?"
              multiline
              value={prompt}
              onChangeText={setPrompt}
              style={{ minHeight: 120 }}
            />
            <Field
              accessibilityLabel="Schedule local time"
              placeholder="HH:MM"
              value={time}
              onChangeText={setTime}
            />
            <Field
              accessibilityLabel="Schedule timezone"
              placeholder="Time zone, e.g. Europe/Warsaw"
              value={timezone}
              onChangeText={setTimezone}
            />
            <Copy small>Repeat</Copy>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {[
                'Daily',
                'Sunday',
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday',
              ].map((label, index) => (
                <Choice
                  key={label}
                  selected={weekday === (index === 0 ? '' : String(index - 1))}
                  onPress={() => setWeekday(index === 0 ? '' : String(index - 1))}
                >
                  {label}
                </Choice>
              ))}
            </View>
            <Field
              accessibilityLabel="Budget per scheduled run"
              placeholder="Maximum estimated USD per run"
              value={budget}
              onChangeText={setBudget}
              keyboardType="decimal-pad"
            />
            <Copy small>Model (explicit choice)</Copy>
            <Button secondary label="Choose scheduled model" onPress={() => setModelDialog(true)}>
              {models.data?.find((m) => m.id === model)?.name ?? 'Choose model'}
            </Button>
            <ErrorNotice error={models.error} />
            <Dialog title="Choose model" visible={modelDialog} close={() => setModelDialog(false)}>
              <Field
                accessibilityLabel="Search models"
                placeholder="Search models"
                value={modelSearch}
                onChangeText={setModelSearch}
              />
              <ModelList
                models={(models.data ?? []).filter((m) =>
                  (m.name + ' ' + m.id).toLowerCase().includes(modelSearch.toLowerCase()),
                )}
                selected={model || null}
                onSelect={(m) => {
                  setModel(m.id);
                  setModelDialog(false);
                }}
              />
            </Dialog>
            <Copy small>Tools</Copy>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {['web', 'files', 'gmail', 'calendar'].map((g) => (
                <Choice
                  key={g}
                  disabled={caps.data?.tools[g as keyof typeof caps.data.tools] !== 'available'}
                  selected={tools.includes(g)}
                  onPress={() =>
                    setTools(tools.includes(g) ? tools.filter((v) => v !== g) : [...tools, g])
                  }
                >
                  {
                    {
                      web: 'Web research',
                      files: 'Photos & files',
                      gmail: 'Gmail',
                      calendar: 'Google Calendar',
                    }[g]
                  }
                </Choice>
              ))}
            </View>
            <Copy small>Project</Copy>
            <Choice selected={!scheduleProject} onPress={() => setScheduleProject(null)}>
              No project
            </Choice>
            {projects.data?.map((p) => (
              <Choice
                key={p.id}
                selected={scheduleProject === p.id}
                onPress={() => setScheduleProject(p.id)}
              >
                {p.name}
              </Choice>
            ))}
            <Button
              disabled={busy || !model || !prompt.trim() || !scheduleTitle.trim()}
              onPress={() =>
                void act(async () => {
                  await api(
                    '/v1/schedules',
                    json('POST', {
                      title: scheduleTitle,
                      prompt,
                      model_id: model,
                      enabled_tools: tools,
                      project_id: scheduleProject,
                      timezone,
                      local_time: time,
                      weekday: weekday === '' ? null : Number(weekday),
                      budget_usd: budget,
                    }),
                  );
                  setScheduleTitle('');
                  setPrompt('');
                  await schedules.refetch();
                })
              }
            >
              Create scheduled task
            </Button>
            <Copy small muted>
              Daily or weekly. A missed period is coalesced into one run. The budget guards
              estimated model submissions; provider billing may differ.
            </Copy>
          </Panel>
          <ErrorNotice error={schedules.error} />
          {schedules.data?.map((s) => (
            <Panel key={s.id}>
              <Copy>
                {s.title} ·{' '}
                {s.paused
                  ? 'Paused'
                  : new Date(s.next_at).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US', {
                      timeZone: s.timezone,
                    })}
              </Copy>
              <Copy small>
                {s.timezone} · {s.local_time} · ${s.budget_usd}/run
              </Copy>
              {s.last_error && <Copy>{s.last_error}</Copy>}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button
                  secondary
                  disabled={busy}
                  onPress={() =>
                    void act(async () => {
                      await api(
                        `/v1/schedules/${s.id}`,
                        json('PATCH', { paused: !s.paused }, s.version),
                      );
                      await schedules.refetch();
                    })
                  }
                >
                  {s.paused ? 'Resume' : 'Pause'}
                </Button>
                <Button secondary onPress={() => setHistoryId(historyId === s.id ? '' : s.id)}>
                  Run history
                </Button>
                <Button
                  danger
                  disabled={busy}
                  onPress={() =>
                    void act(async () => {
                      await api(`/v1/schedules/${s.id}`, json('DELETE', undefined, s.version));
                      await schedules.refetch();
                    })
                  }
                >
                  Delete schedule
                </Button>
              </View>
              {historyId === s.id &&
                scheduleHistory.data?.map((h) => (
                  <View key={h.id}>
                    <Copy small>
                      {h.due_at} · {h.status} {h.error_code ?? ''}
                    </Copy>
                    {h.conversation_id && (
                      <Button secondary onPress={() => router.push(`/chat/${h.conversation_id}`)}>
                        Open task
                      </Button>
                    )}
                  </View>
                ))}
            </Panel>
          ))}
        </>
      )}
      {tab === 'notifications' && (
        <>
          <ErrorNotice error={notices.error} />
          {notices.data?.length === 0 && <Copy>No notifications yet.</Copy>}
          {notices.data?.map((n) => (
            <Panel key={n.id}>
              <Copy>
                {n.read_at ? '' : '● '}
                {n.title}
              </Copy>
              <Button
                secondary
                onPress={() =>
                  void act(async () => {
                    await api(`/v1/notices/${n.id}/read`, json('POST', {}));
                    await notices.refetch();
                    if (n.conversation_id) router.push(`/chat/${n.conversation_id}`);
                  })
                }
              >
                {n.conversation_id ? 'Open result' : 'Mark read'}
              </Button>
            </Panel>
          ))}
        </>
      )}
    </View>
  );
}
