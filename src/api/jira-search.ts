import { requestJira } from './jira-client';

/** Issue como vem da busca: `fields` só com os campos pedidos. */
export interface RawSearchIssue<Fields> {
  id: string;
  key: string;
  fields: Fields;
}

interface SearchResponse<Fields> {
  issues?: RawSearchIssue<Fields>[];
  nextPageToken?: string;
  isLast?: boolean;
}

const SEARCH_PAGE_SIZE = 100;

export interface SearchIssuesResult<Fields> {
  issues: RawSearchIssue<Fields>[];
  /** A busca parou no `limit` com mais issues para trazer. */
  isTruncated: boolean;
}

/** Busca por JQL, paginada por `nextPageToken`, até o fim ou até `limit` issues. */
export async function searchIssues<Fields>(
  jql: string,
  fields: string[],
  options: { signal?: AbortSignal; limit?: number } = {},
): Promise<SearchIssuesResult<Fields>> {
  const { signal, limit = Infinity } = options;
  const issues: RawSearchIssue<Fields>[] = [];
  let nextPageToken: string | undefined;

  for (;;) {
    // GET (o endpoint também aceita POST): GET dispensa o check de XSRF do Jira.
    const data = await requestJira<SearchResponse<Fields>>('rest/api/3/search/jql', {
      params: { jql, fields: fields.join(','), maxResults: SEARCH_PAGE_SIZE, nextPageToken },
      signal,
    });
    issues.push(...(data.issues ?? []));
    const hasMore = !data.isLast && Boolean(data.nextPageToken);
    if (!hasMore) return { issues, isTruncated: false };
    if (issues.length >= limit) return { issues: issues.slice(0, limit), isTruncated: true };
    nextPageToken = data.nextPageToken;
  }
}
