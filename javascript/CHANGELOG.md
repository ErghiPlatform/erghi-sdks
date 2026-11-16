## 2.1.0 (2026-11-17)

- New: `client.inbox` (labels, conversation labels, notes, saved replies, `unassign`) and `client.contacts` (list, search, get, update, block, unblock, erase, contact notes, notifications, mentionable members) with typed models. Labels, conversation notes and saved replies work against the current platform and need `view_conversations` (writes to labels and saved replies need `manage_inbox_settings`); Workspace API keys cannot hold `view_conversations`, `manage_inbox_settings` or `manage_contacts` (not in the platform's grantable key scopes), so these calls need a signed-in teammate's access token; with an API key they answer 403. Contacts, contact notes, notifications, `@mention` ids on notes and `unassign` need the platform release from ErghiPlatform/Erghi PR #256, live on api.erghi.ai since 2026-11-16; a self-hosted platform older than that answers 404. Erasing a contact is permanent. No workspace id is ever passed; it comes from the credential.

- New: `client.insights` for Conversation Insights: `summary(filter)`, `listConversations(filter, { page, pageSize })` and `exportCsv(filter)`. Needs the `view_insights` workspace permission, so use a signed-in Owner or Admin access token; API keys and client-credentials tokens get 403. On Starter, topics, categories and languages come back `null` and the summary's `locked` field names them.

## 2.0.1 (2026-11-06)

- Security: both hubs (`connect` and `connectVisitor`) now log at Warning instead of
  SignalR's default Information level. At Information the client printed the WebSocket URL,
  which carries the configured `accessToken` (as `access_token`) or the visitor token, to the
  console. Failed connections and reconnects are still logged.

## 2.0.0 (2026-11-05)

- Breaking: `Workspace` and `CreateWorkspaceRequest` changed shape, and `workspace.update`/`delete` now throw. The old shapes matched endpoints that never existed, so no working code depended on them, but TypeScript code using them will need updating.

- Fix: `auth` now talks to the platform's real auth endpoints. `refresh`, `me`,
  `verifyEmail`, `forgotPassword` and `resetPassword` called paths that do not exist
  (`/api/auth/refresh`, `/me`, ...), and `login`/`register` read camelCase tokens from a
  snake_case response, so the access token was never set. `resetPassword(token, password)`
  takes the token from the reset email link. While signup awaits email confirmation,
  `register` returns empty tokens.
- Fix: `workspace.list/get/create` use `/api/v1/accounts/workspaces`. `Workspace` is now
  `{ id, name, slug, isCurrent }` and `CreateWorkspaceRequest` is `{ name, companyWebsite? }`.
  `update` and `delete` are deprecated and throw `NOT_SUPPORTED`; the API has no such endpoints.
- Errors from the auth server carry its message (`msg` / `error_description`).

- `chat.sendVoiceMessage(conversationId, audio)` sends a visitor voice note; the platform
  transcribes it and returns the message (`source: 'voice'`). `Message.source` added. Error
  messages now carry the platform's `error` text, and a 400 keeps the response body in `details`.
- `connectVisitor` restarts the visitor hub when a suspended mobile webview resumes and emits
  `conversation.resumed` so the app can reload messages missed meanwhile.

- `chat.createConversation(widgetId, metadata, { identityToken })`, plus
  `chat.attachIdentityToken`, `chat.setSecureContext` and `chat.clearSecureContext`.
  `Conversation.visitorToken` is now typed (returned by create only).
- Visitor chat works end to end: the client keeps each conversation's visitor token
  (`setVisitorToken`/`getVisitorToken`/`clearVisitorToken`) and sends `X-Visitor-Token` on
  `getConversation`, `getMessages`, `sendMessage` and the new `uploadAttachment`;
  `connectVisitor(conversationId)` joins `/hubs/visitor` and emits `context.required`,
  `conversation.escalated` and `conversation.inactivity_warning` besides the existing events.
- Fix: `sendMessage` posted multipart, which the server never accepted; it now uploads files
  to `/attachments` first and posts the message as JSON.

## 1.0.0

- Initial release.
- Real-time chat backed by the official `@microsoft/signalr` client.
