import { ErghiClient } from '../client';
import {
  InsightFilter,
  InsightSummary,
  InsightPage,
  InsightPageParams,
} from '../types';

function toQuery(filter: InsightFilter = {}): Record<string, string | number> {
  const query: Record<string, string | number> = {};
  const iso = (v: string | Date) => (v instanceof Date ? v.toISOString() : v);
  if (filter.from !== undefined) query.from = iso(filter.from);
  if (filter.to !== undefined) query.to = iso(filter.to);
  if (filter.channel) query.channel = filter.channel;
  if (filter.category) query.category = filter.category;
  if (filter.topic) query.topic = filter.topic;
  if (filter.sentiment) query.sentiment = filter.sentiment;
  if (filter.outcome) query.outcome = filter.outcome;
  if (filter.minConfidence !== undefined) query.minConfidence = filter.minConfidence;
  return query;
}

/**
 * Conversation Insights: topic, sentiment and outcome of finished conversations.
 *
 * Needs the `view_insights` workspace permission (Owner and Admin roles), so call it with a
 * signed-in user's access token. Workspace API keys and client-credentials tokens cannot hold
 * that permission and get 403. An invalid filter is a 400 with `code: 'invalid_filter'`.
 */
export class InsightsResource {
  constructor(private client: ErghiClient) {}

  /** Counts by outcome, sentiment, category, topic (top 20) and language, plus the AI-resolved rate. */
  async summary(filter?: InsightFilter): Promise<InsightSummary> {
    const response = await this.client
      .getHttpClient()
      .get<InsightSummary>('/api/v1/insights/summary', { params: toQuery(filter) });
    return response.data;
  }

  /** Classified conversations, newest first. `pageSize` is capped at 100 by the server. */
  async listConversations(filter?: InsightFilter, paging: InsightPageParams = {}): Promise<InsightPage> {
    const params: Record<string, string | number> = toQuery(filter);
    if (paging.page !== undefined) params.page = paging.page;
    if (paging.pageSize !== undefined) params.pageSize = paging.pageSize;
    const response = await this.client
      .getHttpClient()
      .get<InsightPage>('/api/v1/insights/conversations', { params });
    return response.data;
  }

  /**
   * The same rows as a CSV string (newest first, at most 10,000 rows). The server's file starts
   * with a UTF-8 byte-order mark so Excel reads Arabic correctly; depending on the runtime the
   * string may or may not keep it, so prepend a BOM (U+FEFF) when saving a file for Excel. Text
   * fields that start with `= + - @` are prefixed with `'` so a spreadsheet will not run them
   * as formulas.
   */
  async exportCsv(filter?: InsightFilter): Promise<string> {
    const response = await this.client
      .getHttpClient()
      .get<string>('/api/v1/insights/export.csv', { params: toQuery(filter), responseType: 'text' });
    return response.data;
  }
}
