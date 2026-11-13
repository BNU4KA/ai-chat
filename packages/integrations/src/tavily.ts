export type WebHit = { title: string; url: string; excerpt: string; published_date?: string | null };

export class TavilyError extends Error {
  status: number;
  fallbackable: boolean;
  constructor(message: string, status: number, fallbackable: boolean) {
    super(message);
    this.status = status;
    this.fallbackable = fallbackable;
  }
}

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
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      query,
      max_results: maxResults,
      include_answer: false,
      include_published_date: true,
      search_depth: 'basic',
    }),
  });
  if (!response.ok) {
    const fallbackable =
      [401, 402, 403, 429, 432, 433, 434].includes(response.status) || response.status >= 500;
    throw new TavilyError('Web search is unavailable', response.status, fallbackable);
  }
  const body = (await response.json()) as {
    results?: {
      title?: string;
      url?: string;
      content?: string;
      published_date?: string | null;
    }[];
  };
  return (body.results ?? []).slice(0, maxResults).map((result) => ({
    title: result.title ?? result.url ?? 'Result',
    url: result.url ?? '',
    excerpt: (result.content ?? '').slice(0, 1200),
    ...(result.published_date !== undefined ? { published_date: result.published_date } : {}),
  }));
}
