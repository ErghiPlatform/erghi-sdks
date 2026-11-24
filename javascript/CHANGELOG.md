## 2.3.0 (2026-11-24)

- New: reply engine. Let your own agent answer a widget's visitors instead of Erghi AI.
  - `client.replyEngines` (admin, needs `configure_ai`): `list`, `listNames`, `get`, `create`, `update`, `delete`, `enable`, `disable`, `rotateSecret`, `test`, `health`, `listTurns`, `getWidgetBinding`, `setWidgetBinding`, fully typed. The `whsec_` signing secret is returned once, on `create` and `rotateSecret`.
  - `client.agentRuntime` (needs an API key with `agent:runtime`): `getTurn`, `reply`, `typing`, `handoff`, `decline`, `takeBack`, `postBotMessage`. Runtime bodies are snake_case, like the platform's runtime API; reuse `idempotency_key` when you retry.
  - `client.createAgentRuntimeClient(engineId)` / `AgentRuntimeClient`: the live connection (`@microsoft/signalr`, already a dependency) for LiveConnection engines. Reconnects forever and calls `Resume(lastSequence)` after every reconnect; turns are de-duplicated by id; refusals come back as `{ ok: false, code }`, not exceptions. Persist `lastSequence` and pass it back to resume across restarts.
  - `verifyWebhook`, `isValidWebhook`, `parseTurnWebhook`, `signWebhook`: Standard Webhooks verification (`webhook-id`, `webhook-timestamp`, `webhook-signature`; HMAC-SHA256 of `{id}.{timestamp}.{body}`; constant-time compare; 5 minute tolerance; several `v1,` signatures accepted during a secret rotation). Also valid for workspace webhooks. Server-side only.
  - New `ErghiApiError` (extends `ErghiError`, `code` still `'API_ERROR'`) for 403/409 and other statuses the SDK did not map before; adds `errorCode` (the platform's machine code, e.g. `turn_closed`) and `reason`. Code that caught `ErghiError` keeps working.
  - Needs the platform release with reply engines (API version 2026-11-22).
- Known issue, not changed here: `verifyWebhookSignature` (the older helper) checks `X-Erghi-Signature` over the body only, which is not how the platform signs deliveries today; use `verifyWebhook` for real webhook deliveries. Also, a client built with `clientId` and `clientSecret` fetches its token once and does not renew it when it expires (2 hours); the agent runtime hub client does renew.
- New: `client.workforce` for the platform's Workforce API: own and forced agent status, the live board, away reasons, routing skills, per-agent profiles, workforce settings, chat offers (`listMyOffers`, `acceptOffer`, `declineOffer`), the "why me" `getRoutingDecision`, and the agent status, timeline and performance reports (plus CSV exports). `updateSettings` is a true partial update: only the fields you set are sent, so an omitted field keeps its stored value, and `0` turns `idleAwayMinutes`, `signOutAfterHoursMinutes` or `autoAwayAfterMissedOffers` off. A workspace API key with `manage_workforce` can read the live board, away reasons, skills and settings and write everything under it; own status and offers belong to a signed-in teammate (an API key gets 403). Reports need `view_insights` and a plan with workforce analytics (403 `plan_required`).

- New: `client.social` for the Facebook and Instagram social inbox: connections, per-connection settings (partial update), disconnect preview and disconnect, DM reply policy and delivery state, posts, comments (hide, unhide, public reply, private reply, mark done, ignore contact) and the social report (plus CSV). Needs a platform release that has the social inbox, and the workspace must be allowed to use it (403 `social_inbox_unavailable` otherwise). Connecting an account is a browser-only Meta login and is deliberately not wrapped. Server error codes (`private_reply_used`, `use_comment_reply`, `needs_reauth` and so on) are on `error.details.code`.

## 2.2.0 (2026-11-18)

- Fix: conversation calls now work with an API key. Until now `listConversations`, `sendMessage` and the other conversation calls answered 403 "API keys cannot call this endpoint" (or 401 "User ID not found") when the client was built with `clientId` and `clientSecret`, because they called the signed-in-user endpoints. With a client id and secret they now call `/api/v1/agent/conversations` (list, get, messages, send, close), which needs the key's `chat:read` (list, get, messages) or `chat:write` (send, close) scope. Replies sent this way are agent messages with no teammate behind them, and the audit log records the key. Attachments are not supported with a key (the call raises `ATTACHMENTS_NOT_SUPPORTED_FOR_API_KEYS`); `markAsRead` and typing stay teammate/visitor calls. The workspace always comes from the key, never from a parameter. A signed-in teammate token or a visitor keeps using the existing endpoints unchanged. **Needs the platform release that adds `/api/v1/agent/conversations`**; an older platform answers 404 for a key client.

- Fix (types): `Conversation.status` and `Message.type` now list the values the API actually sends, PascalCase (`'Open'`, `'Queued'`, `'Snoozed'`, `'Text'`...); the old lowercase spellings stay in the union so existing comparisons compile. `Message.sender` adds `'bot'` and `'user'`, `Conversation.channel` is a `string` (the API also sends `telegram` and `slack`). No runtime change: the SDK never rewrote these values.

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
