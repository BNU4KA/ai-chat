import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { api } from './api';
import { Button, Copy } from './ui';
import { plainExcerpt } from './excerpt';
import { safeUrl } from './markdown';
import type { Source } from './types';

export function SourceCard({
  source: s,
  onError,
  initiallyOpen = false,
}: {
  source: Source;
  onError: (e: unknown) => void;
  initiallyOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  async function visit() {
    try {
      if (s.url && safeUrl(s.url)) await Linking.openURL(s.url);
      else if (s.document_id)
        router.push({ pathname: '/workspace', params: { document: s.document_id } });
      else if (s.file_id) {
        const result = await api<{ url: string }>(`/v1/files/${s.file_id}/download`);
        await Linking.openURL(result.url + (s.page ? `#page=${s.page}` : ''));
      }
    } catch (e) {
      onError(e);
    }
  }
  const excerpt = plainExcerpt(s.excerpt ?? '');
  return (
    <View style={{ gap: 8 }}>
      <Button secondary quiet onPress={() => setOpen(!open)}>
        [{s.citation_id}] {s.title}
        {s.page ? ` · page ${s.page}` : s.section ? ` · ${s.section}` : ''}
      </Button>
      {open && (
        <View style={{ gap: 10 }}>
          <Copy small muted>
            Retrieved: {s.retrieved_at ? new Date(s.retrieved_at).toLocaleString() : 'Not provided'}
          </Copy>
          {excerpt ? (
            <Copy translate={false}>{excerpt}</Copy>
          ) : (
            <Copy>No stored excerpt is available.</Copy>
          )}
          <Button secondary onPress={() => void visit()}>
            {s.page ? 'Open source page' : 'Open original source'}
          </Button>
        </View>
      )}
    </View>
  );
}
