import { describe, it, expect, vi } from 'vitest';
import { InsightsResource } from './insights';
import type { ErghiClient } from '../client';

function make(data: unknown) {
  const http = { get: vi.fn().mockResolvedValue({ data }) };
  const client = { getHttpClient: () => http } as unknown as ErghiClient;
  return { http, insights: new InsightsResource(client) };
}

describe('InsightsResource', () => {
  it('requests the summary with only the filters that are set', async () => {
    const body = { total: 3, aiResolvedRate: 0.5, outcomes: [], sentiments: [], categories: [], topics: [], languages: [] };
    const { http, insights } = make(body);
    const res = await insights.summary({
      from: new Date('2026-11-01T00:00:00Z'),
      outcome: 'resolved_by_ai',
      minConfidence: 0,
      topic: '',
    });
    expect(http.get).toHaveBeenCalledWith('/api/v1/insights/summary', {
      params: { from: '2026-11-01T00:00:00.000Z', outcome: 'resolved_by_ai', minConfidence: 0 },
    });
    expect(res.aiResolvedRate).toBe(0.5);
  });

  it('sends no params for an unfiltered summary', async () => {
    const { http, insights } = make({});
    await insights.summary();
    expect(http.get).toHaveBeenCalledWith('/api/v1/insights/summary', { params: {} });
  });

  it('lists conversations with paging', async () => {
    const { http, insights } = make({ total: 0, page: 2, pageSize: 50, items: [] });
    const page = await insights.listConversations({ channel: 'widget', sentiment: 'negative' }, { page: 2, pageSize: 50 });
    expect(http.get).toHaveBeenCalledWith('/api/v1/insights/conversations', {
      params: { channel: 'widget', sentiment: 'negative', page: 2, pageSize: 50 },
    });
    expect(page.page).toBe(2);
  });

  it('exports CSV as text', async () => {
    const csv = '﻿conversation_id,classified_at\r\n';
    const { http, insights } = make(csv);
    const res = await insights.exportCsv({ to: '2026-12-01T00:00:00Z' });
    expect(http.get).toHaveBeenCalledWith('/api/v1/insights/export.csv', {
      params: { to: '2026-12-01T00:00:00Z' },
      responseType: 'text',
    });
    expect(res).toBe(csv);
  });
});
