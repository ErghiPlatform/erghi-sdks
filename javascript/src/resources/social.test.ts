import { describe, it, expect, vi } from 'vitest';
import { SocialResource } from './social';
import type { ErghiClient } from '../client';

function make(data: unknown = {}) {
  const ok = vi.fn().mockResolvedValue({ data });
  const http = { get: ok, post: ok, put: ok, patch: ok, delete: ok };
  const client = { getHttpClient: () => http } as unknown as ErghiClient;
  return { http, social: new SocialResource(client) };
}

describe('SocialResource', () => {
  it('lists connections and reads, partially updates and disconnects one', async () => {
    const { http, social } = make({});
    await social.listConnections();
    expect(http.get).toHaveBeenCalledWith('/api/v1/channels/meta/connections');
    await social.getConnectionSettings('k1');
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/channels/meta/connections/k1/settings');
    await social.updateConnectionSettings('k1', { autoHideAbuse: false, commentReplyMode: 'auto', replyToPraise: undefined });
    expect(http.put).toHaveBeenCalledWith('/api/v1/channels/meta/connections/k1/settings', {
      autoHideAbuse: false,
      commentReplyMode: 'auto',
    });
    await social.getDisconnectPreview('k1');
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/channels/meta/connections/k1/disconnect-preview');
    await social.disconnectConnection('k1');
    expect(http.delete).toHaveBeenCalledWith('/api/v1/channels/meta/connections/k1');
  });

  it('reads the reply policy and deliveries of a DM conversation', async () => {
    const { http, social } = make([]);
    await social.getReplyPolicy('c1');
    expect(http.get).toHaveBeenCalledWith('/api/v1/channels/meta/conversations/c1/reply-policy');
    await social.listDeliveries('c1');
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/channels/meta/conversations/c1/deliveries');
  });

  it('lists posts and comments with only the filters that are set', async () => {
    const { http, social } = make({ items: [], total: 0, page: 1, pageSize: 25 });
    await social.listPosts();
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/social/posts', { params: {} });
    await social.listPosts({ connectionId: 'k1', page: 2, pageSize: 50 });
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/social/posts', { params: { connectionId: 'k1', page: 2, pageSize: 50 } });
    await social.listComments({ postId: 'p1', category: 'question', hidden: false, needsAttention: true });
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/social/comments', {
      params: { postId: 'p1', category: 'question', hidden: false, needsAttention: true },
    });
  });

  it('moderates a comment: hide, unhide, reply, private reply, done, ignore', async () => {
    const { http, social } = make({});
    await social.hideComment('m1');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/social/comments/m1/hide');
    await social.unhideComment('m1');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/social/comments/m1/unhide');
    await social.replyToComment('m1', 'Thanks!');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/social/comments/m1/reply', { text: 'Thanks!' });
    await social.privateReplyToComment('m1', 'DM me');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/social/comments/m1/private-reply', { text: 'DM me' });
    await social.markCommentDone('m1');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/social/comments/m1/done');
    await social.ignoreCommentContact('m1');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/social/comments/m1/ignore-contact');
  });

  it('fetches the report and its CSV', async () => {
    const { http, social } = make({});
    await social.getReport({ from: '2026-11-01', timeZone: 'Africa/Cairo' });
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/reports/social', { params: { from: '2026-11-01', timeZone: 'Africa/Cairo' } });
    await social.exportReportCsv();
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/reports/social/export.csv', { params: {}, responseType: 'text' });
  });
});
