import { describe, it, expect, vi } from 'vitest';
import { InboxResource } from './inbox';
import { ContactsResource } from './contacts';
import type { ErghiClient } from '../client';

function make(data: unknown = {}) {
  const ok = vi.fn().mockResolvedValue({ data });
  const http = { get: ok, post: ok, put: ok, patch: ok, delete: ok };
  const client = { getHttpClient: () => http } as unknown as ErghiClient;
  return { http, inbox: new InboxResource(client), contacts: new ContactsResource(client) };
}

describe('InboxResource', () => {
  it('lists, creates, updates and deletes labels', async () => {
    const { http, inbox } = make({ maxLabels: 50, labels: [] });
    await inbox.listLabels();
    expect(http.get).toHaveBeenCalledWith('/api/v1/conversation-labels');
    await inbox.createLabel({ name: 'VIP', color: '#ff0000' });
    expect(http.post).toHaveBeenCalledWith('/api/v1/conversation-labels', { name: 'VIP', color: '#ff0000' });
    await inbox.updateLabel('l1', { name: 'Vip' });
    expect(http.put).toHaveBeenCalledWith('/api/v1/conversation-labels/l1', { name: 'Vip' });
    await inbox.deleteLabel('l1');
    expect(http.delete).toHaveBeenCalledWith('/api/v1/conversation-labels/l1');
  });

  it('assigns labels to a conversation', async () => {
    const { http, inbox } = make([]);
    await inbox.getConversationLabels('c1');
    expect(http.get).toHaveBeenCalledWith('/api/v1/conversations/c1/labels');
    await inbox.setConversationLabels('c1', ['a', 'b']);
    expect(http.put).toHaveBeenCalledWith('/api/v1/conversations/c1/labels', { labelIds: ['a', 'b'] });
    await inbox.addConversationLabel('c1', 'a');
    expect(http.post).toHaveBeenCalledWith('/api/v1/conversations/c1/labels/a');
    await inbox.removeConversationLabel('c1', 'a');
    expect(http.delete).toHaveBeenCalledWith('/api/v1/conversations/c1/labels/a');
  });

  it('manages conversation notes, passing mentions through', async () => {
    const { http, inbox } = make([]);
    await inbox.listNotes('c1');
    expect(http.get).toHaveBeenCalledWith('/api/v1/conversations/c1/notes');
    await inbox.createNote('c1', { content: 'hi @a', mentionedUserIds: ['u1'] });
    expect(http.post).toHaveBeenCalledWith('/api/v1/conversations/c1/notes', {
      content: 'hi @a',
      mentionedUserIds: ['u1'],
    });
    await inbox.updateNote('c1', 'n1', { content: 'x' });
    expect(http.put).toHaveBeenCalledWith('/api/v1/conversations/c1/notes/n1', { content: 'x' });
    await inbox.deleteNote('c1', 'n1');
    expect(http.delete).toHaveBeenCalledWith('/api/v1/conversations/c1/notes/n1');
  });

  it('manages saved replies and only sends search when set', async () => {
    const { http, inbox } = make({ maxResponses: 100, responses: [] });
    await inbox.listCannedResponses();
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/canned-responses', { params: {} });
    await inbox.listCannedResponses('hello');
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/canned-responses', { params: { search: 'hello' } });
    await inbox.createCannedResponse({ shortCode: 'hi', content: 'Hello!' });
    expect(http.post).toHaveBeenCalledWith('/api/v1/canned-responses', { shortCode: 'hi', content: 'Hello!' });
    await inbox.updateCannedResponse('r1', { shortCode: 'hi', content: 'Hey' });
    expect(http.put).toHaveBeenCalledWith('/api/v1/canned-responses/r1', { shortCode: 'hi', content: 'Hey' });
    await inbox.deleteCannedResponse('r1');
    expect(http.delete).toHaveBeenCalledWith('/api/v1/canned-responses/r1');
  });

  it('unassigns, lists notifications and mentionable members', async () => {
    const { http, inbox } = make([]);
    await inbox.unassignConversation('c1');
    expect(http.post).toHaveBeenCalledWith('/api/conversations/c1/unassign');
    await inbox.listNotifications({ unreadOnly: true, limit: 10 });
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/notifications', { params: { unreadOnly: true, limit: 10 } });
    await inbox.markNotificationRead('n1');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/notifications/n1/read');
    await inbox.markAllNotificationsRead();
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/notifications/read-all');
    await inbox.listMentionableMembers();
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/team/mentionable');
  });

  it('reads the unread count', async () => {
    const { inbox } = make({ count: 4 });
    expect(await inbox.getUnreadNotificationCount()).toBe(4);
  });

  it('encodes ids in the path', async () => {
    const { http, inbox } = make([]);
    await inbox.getConversationLabels('a/b');
    expect(http.get).toHaveBeenCalledWith('/api/v1/conversations/a%2Fb/labels');
  });
});

describe('ContactsResource', () => {
  it('lists with only the set filters', async () => {
    const { http, contacts } = make({ items: [], total: 0, page: 1, pageSize: 25 });
    await contacts.list({ search: 'ann', blocked: false, page: 2 });
    expect(http.get).toHaveBeenCalledWith('/api/v1/contacts', { params: { search: 'ann', blocked: false, page: 2 } });
    await contacts.list();
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/contacts', { params: {} });
  });

  it('gets, patches, blocks, unblocks and erases', async () => {
    const { http, contacts } = make({});
    await contacts.get('k1');
    expect(http.get).toHaveBeenCalledWith('/api/v1/contacts/k1');
    await contacts.update('k1', { email: '' });
    expect(http.patch).toHaveBeenCalledWith('/api/v1/contacts/k1', { email: '' });
    await contacts.block('k1');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/contacts/k1/block');
    await contacts.unblock('k1');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/contacts/k1/unblock');
    await contacts.erase('k1');
    expect(http.delete).toHaveBeenCalledWith('/api/v1/contacts/k1');
  });

  it('manages contact notes', async () => {
    const { http, contacts } = make([]);
    await contacts.listNotes('k1');
    expect(http.get).toHaveBeenCalledWith('/api/v1/contacts/k1/notes');
    await contacts.createNote('k1', 'vip');
    expect(http.post).toHaveBeenCalledWith('/api/v1/contacts/k1/notes', { content: 'vip' });
    await contacts.updateNote('k1', 'n1', 'x');
    expect(http.put).toHaveBeenCalledWith('/api/v1/contacts/k1/notes/n1', { content: 'x' });
    await contacts.deleteNote('k1', 'n1');
    expect(http.delete).toHaveBeenCalledWith('/api/v1/contacts/k1/notes/n1');
  });

  it('lists merge suggestions, merges into the target and dismisses a pair', async () => {
    const { http, contacts } = make([]);
    await contacts.listMergeSuggestions();
    expect(http.get).toHaveBeenCalledWith('/api/v1/contacts/merge-suggestions');
    await contacts.merge('keep/1', 'gone');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/contacts/keep%2F1/merge', { sourceContactId: 'gone' });
    await contacts.dismissMergeSuggestion('a', 'b');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/contacts/merge-dismissals', { contactAId: 'a', contactBId: 'b' });
  });
});
