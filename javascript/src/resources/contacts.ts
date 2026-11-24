import { ErghiClient } from '../client';
import {
  ContactDetail,
  ContactEraseResult,
  ContactMergeResult,
  ContactMergeSuggestion,
  ContactListParams,
  ContactNote,
  ContactPage,
  UpdateContactRequest,
} from '../types';

const seg = (id: string) => encodeURIComponent(id);

/**
 * Contacts: the people who have chatted with the workspace. Requires platform PR #256.
 *
 * Workspace (admin / server-side) operations: the workspace comes from the API key or access
 * token. Reading needs `view_conversations`; update, block, unblock and erase need
 * `manage_contacts`. Contact notes follow the same rule as conversation notes (an API key can
 * read them but cannot author them).
 *
 * Merging needs a signed-in teammate's token with `manage_contacts` who can see every
 * conversation (a teammate limited to some inboxes gets 403 `contact_out_of_scope`). API keys get
 * 403: `manage_contacts` is never grantable to a key.
 */
export class ContactsResource {
  constructor(private client: ErghiClient) {}

  private get http() {
    return this.client.getHttpClient();
  }

  async list(params: ContactListParams = {}): Promise<ContactPage> {
    const query: Record<string, string | number | boolean> = {};
    if (params.search) query.search = params.search;
    if (params.blocked !== undefined) query.blocked = params.blocked;
    if (params.page !== undefined) query.page = params.page;
    if (params.pageSize !== undefined) query.pageSize = params.pageSize;
    return (await this.http.get<ContactPage>('/api/v1/contacts', { params: query })).data;
  }

  async get(contactId: string): Promise<ContactDetail> {
    return (await this.http.get<ContactDetail>(`/api/v1/contacts/${seg(contactId)}`)).data;
  }

  /** Needs `manage_contacts`. Omitted fields are unchanged; an empty string clears a field. */
  async update(contactId: string, request: UpdateContactRequest): Promise<ContactDetail> {
    return (await this.http.patch<ContactDetail>(`/api/v1/contacts/${seg(contactId)}`, request)).data;
  }

  /** Needs `manage_contacts`. Stops the contact starting new conversations. */
  async block(contactId: string): Promise<void> {
    await this.http.post(`/api/v1/contacts/${seg(contactId)}/block`);
  }

  /** Needs `manage_contacts`. */
  async unblock(contactId: string): Promise<void> {
    await this.http.post(`/api/v1/contacts/${seg(contactId)}/unblock`);
  }

  /**
   * Needs `manage_contacts`. IRREVERSIBLY deletes the contact and all of their conversations and
   * messages (GDPR erasure). The server records the erasure in the security audit log.
   */
  async erase(contactId: string): Promise<ContactEraseResult> {
    return (await this.http.delete<ContactEraseResult>(`/api/v1/contacts/${seg(contactId)}`)).data;
  }

  async listNotes(contactId: string): Promise<ContactNote[]> {
    return (await this.http.get<ContactNote[]>(`/api/v1/contacts/${seg(contactId)}/notes`)).data;
  }

  /** Needs a member token (403 `member_required` for API keys). */
  async createNote(contactId: string, content: string): Promise<ContactNote> {
    return (await this.http.post<ContactNote>(`/api/v1/contacts/${seg(contactId)}/notes`, { content })).data;
  }

  /** Only the author can edit (403 `note_not_author`). */
  async updateNote(contactId: string, noteId: string, content: string): Promise<ContactNote> {
    return (
      await this.http.put<ContactNote>(`/api/v1/contacts/${seg(contactId)}/notes/${seg(noteId)}`, { content })
    ).data;
  }

  /** The author or someone with `manage_contacts` can delete. */
  async deleteNote(contactId: string, noteId: string): Promise<void> {
    await this.http.delete(`/api/v1/contacts/${seg(contactId)}/notes/${seg(noteId)}`);
  }

  // -- Merging duplicates -------------------------------------------------------------------

  /**
   * Pairs of contacts that share a verified email or phone number (at most 100). Pairs that would
   * put two identities on one channel, and dismissed pairs, are left out.
   */
  async listMergeSuggestions(): Promise<ContactMergeSuggestion[]> {
    return (await this.http.get<ContactMergeSuggestion[]>('/api/v1/contacts/merge-suggestions')).data;
  }

  /**
   * IRREVERSIBLY merges `sourceContactId` into `targetContactId`: the source's conversations, notes
   * and channel identities move to the target, the target keeps its own name, email and phone
   * (filling only blanks from the source), and the source contact is deleted. Answers 400
   * `merge_same_contact` and 409 `merge_conflicting_identities` (both have an identity on the same
   * channel). Sends the `contact.merged` webhook and writes the security audit log.
   */
  async merge(targetContactId: string, sourceContactId: string): Promise<ContactMergeResult> {
    return (
      await this.http.post<ContactMergeResult>(`/api/v1/contacts/${seg(targetContactId)}/merge`, { sourceContactId })
    ).data;
  }

  /** Stops suggesting this pair. Order does not matter, and repeating it is harmless. */
  async dismissMergeSuggestion(contactAId: string, contactBId: string): Promise<void> {
    await this.http.post('/api/v1/contacts/merge-dismissals', { contactAId, contactBId });
  }
}
