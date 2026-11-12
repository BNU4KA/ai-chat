import { approvalFields, revisedArguments } from '@ai-chat/contracts';
import { Text } from './locale-ui';
import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { Approval } from './types';
import { api, json } from './api';
import { Button, Copy, ErrorNotice, Panel, Field } from './ui';
import { useTheme } from './theme';
function show(value: unknown): string {
  if (Array.isArray(value))
    return value
      .map((v) =>
        typeof v === 'object' && v && 'address' in v ? String(v.address) : JSON.stringify(v),
      )
      .join(', ');
  if (typeof value === 'object' && value) return JSON.stringify(value, null, 2);
  return String(value ?? '');
}
export function ApprovalCard({ approval }: { approval: Approval }) {
  const cache = useQueryClient();
  const { colors: c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [initialFields, setInitialFields] = useState<Record<string, string>>({});
  function edit() {
    const initial = approvalFields(
      approval.tool_name,
      approval.arguments ?? {},
      approval.structured_preview,
    );
    setInitialFields(initial);
    setFields(initial);
    setEditing(true);
  }
  async function revise() {
    setBusy(true);
    setError(null);
    try {
      const args = revisedArguments(approval.arguments ?? {}, initialFields, fields);
      await api(
        `/v1/approvals/${approval.id}/revise`,
        json('POST', { args_hash: approval.args_hash, arguments: args }),
      );
      setEditing(false);
      await cache.invalidateQueries({ queryKey: ['run', approval.run_id] });
    } catch (e) {
      setError(e);
      void cache.invalidateQueries({ queryKey: ['run', approval.run_id] });
    } finally {
      setBusy(false);
    }
  }
  const [error, setError] = useState<unknown>(null);
  const expired = new Date(approval.expires_at).getTime() < Date.now();
  async function decide(decision: 'approve' | 'reject') {
    setBusy(true);
    setError(null);
    try {
      await api(
        `/v1/approvals/${approval.id}/decision`,
        json('POST', { decision, args_hash: approval.args_hash }),
      );
      await cache.invalidateQueries({ queryKey: ['run', approval.run_id] });
    } catch (e) {
      setError(e);
      void cache.invalidateQueries({ queryKey: ['run', approval.run_id] });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel>
      <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>
        Review {approval.tool_name.replaceAll('_', ' ')}
      </Text>
      {Object.entries(approval.structured_preview ?? {})
        .filter(([key]) => key !== 'kind')
        .map(([key, value]) => (
          <View key={key} style={{ gap: 3 }}>
            <Copy small muted>
              {key.replaceAll('_', ' ')}
            </Copy>
            <Copy translate={false}>{show(value)}</Copy>
          </View>
        ))}
      <Copy small muted>
        {expired
          ? 'Expired — ask the agent to prepare a new action.'
          : `Expires ${new Date(approval.expires_at).toLocaleString()}`}
      </Copy>
      {editing && (
        <View style={{ gap: 10 }}>
          {Object.entries(fields)
            .filter(([key]) => !['event_id', 'expected_etag'].includes(key))
            .map(([key, value]) => (
              <View key={key}>
                <Copy small>{key.replaceAll('_', ' ')}</Copy>
                <Field
                  accessibilityLabel={`Edit ${key.replaceAll('_', ' ')}`}
                  multiline={['body_text', 'description'].includes(key)}
                  value={value}
                  onChangeText={(text) => setFields({ ...fields, [key]: text })}
                />
              </View>
            ))}
          <Button disabled={busy} onPress={() => void revise()}>
            Save revised proposal
          </Button>
          <Button secondary onPress={() => setEditing(false)}>
            Cancel editing
          </Button>
          <Copy small muted>
            Saving cancels the old approval. Review and confirm the new preview separately.
          </Copy>
        </View>
      )}
      <ErrorNotice error={error} />
      {approval.status === 'pending' && !expired && !editing ? (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Button disabled={busy} secondary onPress={edit}>
            Edit proposal
          </Button>
          <Button disabled={busy} onPress={() => void decide('approve')}>
            Confirm action
          </Button>
          <Button disabled={busy} secondary onPress={() => void decide('reject')}>
            Reject
          </Button>
        </View>
      ) : (
        <Copy small>{approval.status}</Copy>
      )}
    </Panel>
  );
}
