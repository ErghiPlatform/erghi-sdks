---
title: Inbox and contacts API
description: Labels, private notes, saved replies, contacts and notifications from the server-side SDKs: who can call each one, what the API key can and cannot do, and which calls need the platform release that has not shipped yet.
---

# Inbox and contacts API

These are the working tools of the shared inbox: conversation **labels**, private **notes** on a
conversation or a contact, **saved replies**, the **contacts** list and in-app **notifications**.
They are workspace operations. Call them from your server with a signed-in teammate's access token, never from a visitor's browser: the widget and the visitor-side SDK
surface do not expose them, and the workspace always comes from the credential, never from a
parameter you pass.

> **Platform release.** Labels, conversation notes and saved replies are live. Contacts, contact
> notes, notifications, `@mention` notifications and `unassign` need the platform release in
> ErghiPlatform/Erghi PR #256 and are marked **(#256)** below. Against a platform without it those
> calls answer 404.

## Who can call what

| Call | Permission |
|---|---|
| List labels, saved replies, notes, contacts; read a conversation's labels; put labels on a conversation; write notes | `view_conversations` |
| Create, update, delete a label or a saved reply | `manage_inbox_settings` |
| Update, block, unblock, erase a contact **(#256)** | `manage_contacts` |

Two limits that surprise people:

- **Workspace API keys cannot call these today.** The platform only lets a key hold a fixed set of
  setup scopes (`configure_ai`, `manage_widgets`, `view_insights` and similar), and
  `view_conversations`, `manage_inbox_settings` and `manage_contacts` are not among them, so an
  API key gets `403`. Use a signed-in teammate's access token. Because of that, the erghi-mcp server
  (which runs on an API key) does not offer these tools yet.
- Only the author can edit a note (`note_not_author`); the author, or someone with
  `manage_inbox_settings` (`manage_contacts` for contact notes), can delete it.
- **Notifications belong to a person**, so they only make sense with a member's access token. **(#256)**

Errors use the SDK's usual error types. The server's `code` (for example `label_name_taken`,
`label_limit_reached`, `canned_response_short_code_taken`, `note_limit_reached`) is in the error
body.

## Erasing a contact is permanent

`erase` deletes the contact and every conversation and message that belongs to them (a GDPR
erasure). It cannot be undone. The server records who did it in the security audit log, without any
personal data. **(#256)**

## Examples

### JavaScript / TypeScript

```ts
import { ErghiClient } from '@erghi-ai/sdk';

// Use a teammate's access token: API keys cannot hold these permissions.
const erghi = new ErghiClient({ apiUrl: 'https://api.erghi.ai', accessToken: process.env.ERGHI_ACCESS_TOKEN });

const { labels } = await erghi.inbox.listLabels();
const vip = await erghi.inbox.createLabel({ name: 'VIP', color: '#d97706' });
await erghi.inbox.addConversationLabel(conversationId, vip.id);

const replies = await erghi.inbox.listCannedResponses('refund');
await erghi.inbox.createCannedResponse({ shortCode: 'hi', content: 'Hello! How can I help?' });

await erghi.inbox.createNote(conversationId, { content: 'Called back, waiting on finance.' });

// Contacts (requires platform PR #256)
const page = await erghi.contacts.list({ search: 'ann', pageSize: 20 });
await erghi.contacts.block(page.items[0].id);
```

### Python

```python
import os
from erghi import ErghiClient

client = ErghiClient(api_url="https://api.erghi.ai", api_key=os.environ["ERGHI_API_KEY"])

labels = await client.inbox.list_labels()
vip = await client.inbox.create_label("VIP", color="#d97706")
await client.inbox.add_conversation_label(conversation_id, vip.id)

replies = await client.inbox.list_canned_responses("refund")
await client.inbox.create_canned_response("hi", "Hello! How can I help?")

# Contacts (requires platform PR #256)
page = await client.contacts.list(search="ann", page_size=20)
await client.contacts.block(page.items[0].id)
```

### .NET

```csharp
using Erghi.SDK;

var client = new ErghiClient(new ErghiConfig { ApiUrl = "https://api.erghi.ai", ApiKey = Environment.GetEnvironmentVariable("ERGHI_API_KEY") });

var labels = await client.Inbox.ListLabelsAsync();
var vip = await client.Inbox.CreateLabelAsync("VIP", "#d97706");
await client.Inbox.AddConversationLabelAsync(conversationId, vip.Id);

var replies = await client.Inbox.ListCannedResponsesAsync("refund");
await client.Inbox.CreateCannedResponseAsync("hi", "Hello! How can I help?");

// Contacts (requires platform PR #256)
var page = await client.Contacts.ListAsync(search: "ann", pageSize: 20);
await client.Contacts.BlockAsync(page.Items[0].Id);
```

### Flutter / Dart

```dart
final erghi = ErghiClient(
  config: ErghiConfig(apiUrl: 'https://api.erghi.ai', apiKey: apiKey),
);

final labels = await erghi.inbox.listLabels();
final vip = await erghi.inbox.createLabel('VIP', color: '#d97706');
await erghi.inbox.addConversationLabel(conversationId, vip.id);

final replies = await erghi.inbox.listCannedResponses(search: 'refund');
await erghi.inbox.createCannedResponse('hi', 'Hello! How can I help?');

// Contacts (requires platform PR #256)
final page = await erghi.contacts.list(search: 'ann', pageSize: 20);
await erghi.contacts.block(page.items.first.id);
```

### Swift

```swift
let erghi = ErghiClient(
    config: ErghiConfig(apiURL: URL(string: "https://api.erghi.ai")!, apiKey: apiKey)
)

let labels = try await erghi.inbox.listLabels()
let vip = try await erghi.inbox.createLabel(name: "VIP", color: "#d97706")
_ = try await erghi.inbox.addConversationLabel(conversationId: conversationId, labelId: vip.id)

let replies = try await erghi.inbox.listCannedResponses(search: "refund")
_ = try await erghi.inbox.createCannedResponse(shortCode: "hi", content: "Hello! How can I help?")

// Contacts (requires platform PR #256)
let page = try await erghi.contacts.list(search: "ann", pageSize: 20)
try await erghi.contacts.block(id: page.items[0].id)
```

The React and Angular packages do not include these calls (they are in maintenance tier). Use the
JavaScript client from your server instead.

## HTTP reference

| Method and path | Notes |
|---|---|
| `GET /api/v1/conversation-labels` | `{ maxLabels, labels[] }` |
| `POST /api/v1/conversation-labels` | `{ name, color?, description? }` |
| `PUT` / `DELETE /api/v1/conversation-labels/{id}` | |
| `GET` / `PUT /api/v1/conversations/{id}/labels` | `PUT` body `{ labelIds[] }` replaces the set |
| `POST` / `DELETE /api/v1/conversations/{id}/labels/{labelId}` | Add or remove one; returns the set |
| `GET` / `POST /api/v1/conversations/{id}/notes` | Create body `{ content, mentionedUserIds? }` (`mentionedUserIds` **(#256)**) |
| `PUT` / `DELETE /api/v1/conversations/{id}/notes/{noteId}` | |
| `GET /api/v1/canned-responses?search=` | `{ maxResponses, responses[] }` |
| `POST /api/v1/canned-responses`, `PUT` / `DELETE .../{id}` | `{ shortCode, content }` |
| `POST /api/conversations/{id}/unassign` **(#256)** | Back to the queue; 409 if resolved or closed |
| `GET /api/v1/contacts?search=&blocked=&page=&pageSize=` **(#256)** | `pageSize` up to 100 |
| `GET` / `PATCH` / `DELETE /api/v1/contacts/{id}` **(#256)** | `PATCH` body `{ name?, email?, phone? }`: omitted is unchanged, empty string clears. `DELETE` erases |
| `POST /api/v1/contacts/{id}/block` and `/unblock` **(#256)** | |
| `GET` / `POST /api/v1/contacts/{id}/notes`, `PUT` / `DELETE .../{noteId}` **(#256)** | |
| `GET /api/v1/notifications?unreadOnly=&limit=` **(#256)** | Plus `GET .../unread-count`, `POST .../{id}/read`, `POST .../read-all` |
| `GET /api/v1/team/mentionable` **(#256)** | Teammates you can `@mention` |
