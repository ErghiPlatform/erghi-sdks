import { describe, it, expect, vi } from 'vitest';
import { WorkforceResource } from './workforce';
import type { ErghiClient } from '../client';

function make(data: unknown = {}) {
  const ok = vi.fn().mockResolvedValue({ data });
  const http = { get: ok, post: ok, put: ok, patch: ok, delete: ok };
  const client = { getHttpClient: () => http } as unknown as ErghiClient;
  return { http, workforce: new WorkforceResource(client) };
}

describe('WorkforceResource', () => {
  it('reads and sets status, the supervisor way and the own way', async () => {
    const { http, workforce } = make({});
    await workforce.getMyStatus();
    expect(http.get).toHaveBeenCalledWith('/api/v1/workforce/me/status');
    await workforce.setMyStatus({ state: 'away', reasonId: 'r1', returnChats: true });
    expect(http.put).toHaveBeenCalledWith('/api/v1/workforce/me/status', { state: 'away', reasonId: 'r1', returnChats: true });
    await workforce.setAgentStatus('a/1', { state: 'ready' });
    expect(http.put).toHaveBeenLastCalledWith('/api/v1/workforce/agents/a%2F1/status', { state: 'ready' });
    await workforce.signOutAgent('a1');
    expect(http.post).toHaveBeenCalledWith('/api/v1/workforce/agents/a1/sign-out');
    await workforce.getLive();
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/workforce/live');
  });

  it('manages away reasons and only sends includeArchived when set', async () => {
    const { http, workforce } = make([]);
    await workforce.listAwayReasons();
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/workforce/away-reasons', { params: {} });
    await workforce.listAwayReasons(true);
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/workforce/away-reasons', { params: { includeArchived: true } });
    await workforce.createAwayReason({ name: 'Lunch', maxMinutes: 60 });
    expect(http.post).toHaveBeenCalledWith('/api/v1/workforce/away-reasons', { name: 'Lunch', maxMinutes: 60 });
    await workforce.updateAwayReason('r1', { name: 'Lunch', reassignChats: true });
    expect(http.put).toHaveBeenCalledWith('/api/v1/workforce/away-reasons/r1', { name: 'Lunch', reassignChats: true });
    await workforce.archiveAwayReason('r1');
    expect(http.delete).toHaveBeenCalledWith('/api/v1/workforce/away-reasons/r1');
  });

  it('manages skills and agent profiles', async () => {
    const { http, workforce } = make({});
    await workforce.listSkills(true);
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/workforce/skills', { params: { includeArchived: true } });
    await workforce.createSkill({ name: 'Billing', description: 'Invoices' });
    expect(http.post).toHaveBeenCalledWith('/api/v1/workforce/skills', { name: 'Billing', description: 'Invoices' });
    await workforce.updateSkill('s1', { archived: false });
    expect(http.put).toHaveBeenLastCalledWith('/api/v1/workforce/skills/s1', { archived: false });
    await workforce.archiveSkill('s1');
    expect(http.delete).toHaveBeenCalledWith('/api/v1/workforce/skills/s1');
    await workforce.getAgentProfile('a1');
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/workforce/agents/a1/profile');
    await workforce.saveAgentProfile('a1', { maxConcurrentChats: 0, skills: [{ skillId: 's1', level: 2 }] });
    expect(http.put).toHaveBeenLastCalledWith('/api/v1/workforce/agents/a1/profile', {
      maxConcurrentChats: 0,
      skills: [{ skillId: 's1', level: 2 }],
    });
  });

  it('updates settings as a partial: unset fields are omitted, 0 and false are kept', async () => {
    const { http, workforce } = make({});
    await workforce.getSettings();
    expect(http.get).toHaveBeenCalledWith('/api/v1/workforce/settings');
    await workforce.updateSettings({ idleAwayMinutes: 0, requireAwayReason: false, signOutAfterHoursMinutes: undefined });
    expect(http.put).toHaveBeenLastCalledWith('/api/v1/workforce/settings', { idleAwayMinutes: 0, requireAwayReason: false });
    const sent = http.put.mock.calls.at(-1)![1] as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(['idleAwayMinutes', 'requireAwayReason']);
    await workforce.updateSettings({ routing: { offerMode: 'ring', skillWaitSeconds: undefined } });
    expect(http.put).toHaveBeenLastCalledWith('/api/v1/workforce/settings', { routing: { offerMode: 'ring' } });
    await workforce.updateSettings({});
    expect(http.put).toHaveBeenLastCalledWith('/api/v1/workforce/settings', {});
  });

  it('lists, accepts and declines offers and reads the routing decision', async () => {
    const { http, workforce } = make({ items: [{ offerId: 'o1' }], conversationId: 'c1' });
    expect(await workforce.listMyOffers()).toEqual([{ offerId: 'o1' }]);
    expect(http.get).toHaveBeenCalledWith('/api/v1/workforce/offers/mine');
    await workforce.acceptOffer('o1');
    expect(http.post).toHaveBeenCalledWith('/api/v1/workforce/offers/o1/accept');
    await workforce.declineOffer('o1');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/workforce/offers/o1/decline');
    await workforce.getRoutingDecision('c1');
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/conversations/c1/routing-decision');
  });

  it('calls the reports with only the query fields that are set', async () => {
    const { http, workforce } = make({});
    await workforce.getAgentStatusReport();
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/reports/agent-status', { params: {} });
    await workforce.getAgentStatusReport({ from: new Date('2026-11-01T00:00:00Z'), timeZone: 'Africa/Cairo', groupBy: 'day' });
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/reports/agent-status', {
      params: { from: '2026-11-01T00:00:00.000Z', timeZone: 'Africa/Cairo', groupBy: 'day' },
    });
    await workforce.getAgentStatusTimeline('a1', { to: '2026-11-30' });
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/reports/agent-status/timeline', {
      params: { agentId: 'a1', to: '2026-11-30' },
    });
    await workforce.getAgentPerformanceReport({ groupBy: 'team' });
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/reports/agent-performance', { params: { groupBy: 'team' } });
    await workforce.exportAgentStatusCsv();
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/reports/agent-status/export.csv', { params: {}, responseType: 'text' });
    await workforce.exportAgentPerformanceCsv();
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/reports/agent-performance/export.csv', {
      params: {},
      responseType: 'text',
    });
  });
});
