export type WebHit = { title: string; url: string; excerpt: string };

export async function searchWeb(
  apiKey: string,
  query: string,
  maxResults: number,
  fetchImpl: typeof fetch = fetch,
): Promise<WebHit[]> {
  const response = await fetchImpl('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      query,
      max_results: maxResults,
      include_answer: false,
      search_depth: 'basic',
    }),
  });
  if (!response.ok) throw new Error('Web search is unavailable');
  const body = (await response.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  return (body.results ?? []).slice(0, maxResults).map((result) => ({
    title: result.title ?? result.url ?? 'Result',
    url: result.url ?? '',
    excerpt: (result.content ?? '').slice(0, 500),
  }));
}
