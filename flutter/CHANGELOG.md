## 1.3.0 (2026-11-18)

- Fix: conversation calls now work with an API key. Until now `listConversations`, `sendMessage` and the other conversation calls answered 403 "API keys cannot call this endpoint" (or 401 "User ID not found") when the client was built with `clientId` and `clientSecret`, because they called the signed-in-user endpoints. With a client id and secret they now call `/api/v1/agent/conversations` (list, get, messages, send, close), which needs the key's `chat:read` (list, get, messages) or `chat:write` (send, close) scope. Replies sent this way are agent messages with no teammate behind them, and the audit log records the key. Attachments are not supported with a key (the call raises `ATTACHMENTS_NOT_SUPPORTED_FOR_API_KEYS`); `markAsRead` and typing stay teammate/visitor calls. The workspace always comes from the key, never from a parameter. A signed-in teammate token or a visitor keeps using the existing endpoints unchanged. **Needs the platform release that adds `/api/v1/agent/conversations`**; an older platform answers 404 for a key client.
  Call `auth.authenticate()` first so the key's token is set.

- Fix: `Conversation.fromJson` and `Message.fromJson` threw on real API responses (the API sends `startedAt`, `assignedAgentId`, `sender`, a PascalCase `status`/`type` such as `"Open"`, a nullable `senderId` and `readAt`). They now read those, and still accept the old key names. `ConversationStatus` gains `queued` and `snoozed`, `MessageSender` gains `agent` and `bot`; matching ignores case and an unknown value falls back instead of failing the response.

## 1.2.0 (2026-11-17)

- New: `ErghiClient.inbox` (labels, conversation labels, notes, saved replies, `unassign`) and `ErghiClient.contacts` (list, search, get, update, block, unblock, erase, contact notes, notifications, mentionable members) with typed models. Labels, conversation notes and saved replies work against the current platform and need `view_conversations` (writes to labels and saved replies need `manage_inbox_settings`); Workspace API keys cannot hold `view_conversations`, `manage_inbox_settings` or `manage_contacts` (not in the platform's grantable key scopes), so these calls need a signed-in teammate's access token; with an API key they answer 403. Contacts, contact notes, notifications, `@mention` ids on notes and `unassign` need the platform release from ErghiPlatform/Erghi PR #256, live on api.erghi.ai since 2026-11-16; a self-hosted platform older than that answers 404. Erasing a contact is permanent. No workspace id is ever passed; it comes from the credential.

- New: `ErghiClient.insights` for Conversation Insights: `summary`, `listConversations` and `exportCsv`, with `InsightFilter`, `InsightSummary` and `InsightPage`. Needs the `view_insights` workspace permission, so use a signed-in Owner or Admin access token; API keys and client-credentials tokens get 403. On Starter, topics, categories and languages come back `null` and the summary's `locked` field names them.

## 1.1.0 (2026-11-05)


- Fix: `AuthResource` now talks to the platform's real auth endpoints (`refresh` and `me`
  called paths that do not exist) and maps the auth server's snake_case session, which
  `login` could not parse before.
- New: `verifyEmail`, `forgotPassword`, `resetPassword`, `ChatResource.listConversations`
  and `closeConversation`.
- Fix: `markAsRead` used PUT; the endpoint is POST.

- `Message.source` ('voice' for a visitor voice note, whose `content` is the transcript).

## 1.0.1

- Fix package description metadata (no functional changes).

## 1.0.0

- Initial release.
- Real-time chat backed by the actual SignalR wire protocol (negotiate + handshake + framed invocations), implemented directly on top of `web_socket_channel` since no official SignalR client exists for Dart.
