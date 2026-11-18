## 1.2.1 (2026-11-18)

- Fix (types): `Conversation.status` and `Message.type` list the PascalCase values the API sends (`'Open'`, `'Queued'`, `'Text'`...) alongside the old lowercase spellings; `Message.sender` adds `'bot'` and `'user'`; `Conversation` gains `channel` and `startedAt`, `Message` gains `readAt`. No runtime change. Browser apps do not use API keys, so the key-scoped conversation endpoints are not wired here.

## 1.2.0 (2026-11-17)

- Gap, not implemented (maintenance tier): the inbox and contacts API (labels, notes, saved replies, contacts, notifications). Use the JavaScript SDK from your server. Recorded in `parity.json`.

- New: `InsightsService` for Conversation Insights: `getSummary(filter)`, `getConversations(filter, { page, pageSize })` and `exportCsv(filter)`, with typed models. Needs the `view_insights` workspace permission, so use a signed-in Owner or Admin access token; API keys and client-credentials tokens get 403. On Starter, topics, categories and languages come back `null` and the summary's `locked` field names them.

## 1.1.1 (2026-11-06)

- Security: `SignalRService.connect` now logs at Warning instead of Information. At
  Information SignalR printed the WebSocket URL, including `access_token`, to the browser
  console. `connectVisitor` already used Warning.

## 1.1.0 (2026-11-05)


- Fix: `AuthService.refreshToken` and `me` called paths that do not exist, and every auth
  call read camelCase tokens from the auth server's snake_case response. `User.workspaceId`
  and `role` now come from the token's `app_metadata`.

- `SignalRService.connectVisitor` restarts the hub when a suspended mobile webview resumes
  (visible, online, or restored from the back/forward cache) and emits a `resumed` event so the
  app can reload messages missed meanwhile.

- `ChatService.createConversation(widgetId, metadata, identityToken)`, plus
  `attachIdentityToken`, `setSecureContext` and `clearSecureContext`.
  `Conversation.visitorToken` is now typed (returned by create only).
- Visitor chat: `ChatService` keeps each conversation's visitor token and sends
  `X-Visitor-Token` on visitor calls; `sendMessage` takes optional files (uploaded first via
  the new `uploadAttachment`); `SignalRService.connectVisitor(conversationId)` joins
  `/hubs/visitor`.
- Fix: `SignalRService` listened for `ReceiveMessage`, an event the server never sends, so
  no message ever arrived in real time; it now handles `MessageReceived`, plus closed,
  assigned, escalated, inactivity-warning and context-required events.

## 1.0.1

- Fix package description metadata (no functional changes).

## 1.0.0

- Initial release.
