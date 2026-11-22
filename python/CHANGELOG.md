## Unreleased

- New: reply engine. Let your own agent answer a widget's visitors instead of Erghi AI.
  - `client.reply_engines` (admin, needs `configure_ai`): list, list_names, get, create, update, delete, enable, disable, rotate_secret, test, health, list_turns, get_widget_binding, set_widget_binding. Typed pydantic models (`ReplyEngine`, `ReplyEngineWrite`, `ReplyEngineHealth`...). The `whsec_` signing secret is returned once, on create and rotate_secret.
  - `client.agent_runtime` (needs an API key with `agent:runtime`): get_turn, reply, typing, handoff, decline, take_back, post_bot_message. `AgentReply.of(key, "text")` builds a reply; reuse the idempotency key when you retry.
  - `verify_webhook`, `is_valid_webhook`, `parse_turn_webhook` and `sign_webhook`: Standard Webhooks verification (`webhook-id`, `webhook-timestamp`, `webhook-signature`; HMAC-SHA256 of `{id}.{timestamp}.{body}`; constant-time compare; 5 minute tolerance; several `v1,` signatures accepted during a secret rotation). Also valid for workspace webhooks.
  - New `ApiError` (a subclass of `ErghiError`, still `code == "API_ERROR"`) for 403/409 and other statuses the SDK did not map before; it adds `error_code` (the platform's machine code, for example `turn_closed`) and `reason`. Code that caught `ErghiError` keeps working.
  - Not in this SDK: the live-connection (SignalR) client; use the REST runtime calls or the webhook mode. Needs the platform release with reply engines (API version 2026-11-22).
- Known issue, not changed here: `verify_webhook_signature` (the older helper) checks `X-Erghi-Signature` over the body only, which is not how the platform signs deliveries today; use `verify_webhook` for real webhook deliveries.
- Suggested next version: 2.3.0 (additive).

## 2.2.0 (2026-11-18)

- Fix: conversation calls now work with an API key. Until now `list_conversations`, `send_message` and the other conversation calls answered 403 "API keys cannot call this endpoint" (or 401 "User ID not found") when the client was built with `client_id` and `client_secret`, because they called the signed-in-user endpoints. With a client id and secret they now call `/api/v1/agent/conversations` (list, get, messages, send, close), which needs the key's `chat:read` (list, get, messages) or `chat:write` (send, close) scope. Replies sent this way are agent messages with no teammate behind them, and the audit log records the key. Attachments are not supported with a key (the call raises `ATTACHMENTS_NOT_SUPPORTED_FOR_API_KEYS`); `markAsRead` and typing stay teammate/visitor calls. The workspace always comes from the key, never from a parameter. A signed-in teammate token or a visitor keeps using the existing endpoints unchanged. **Needs the platform release that adds `/api/v1/agent/conversations`**; an older platform answers 404 for a key client.

- Fix: `get_conversation` always raised a pydantic `ValidationError`, because the API sends `status: "Open"` and the model only allowed lowercase. `Conversation.status` and `Message.type` are now plain strings, normalised to lowercase (`"open"`, `"text"`), and accept every status the API sends (`queued`, `snoozed` included) and any future one. `Message.sender` accepts `bot` and `user`; `Conversation.channel` accepts any channel (`telegram`, `slack`...). Code that compared against the lowercase literals keeps working.

## 2.1.0 (2026-11-17)

- New: `client.inbox` (labels, conversation labels, notes, saved replies, `unassign`) and `client.contacts` (list, search, get, update, block, unblock, erase, contact notes, notifications, mentionable members) with typed pydantic models. Labels, conversation notes and saved replies work against the current platform and need `view_conversations` (writes to labels and saved replies need `manage_inbox_settings`); Workspace API keys cannot hold `view_conversations`, `manage_inbox_settings` or `manage_contacts` (not in the platform's grantable key scopes), so these calls need a signed-in teammate's access token; with an API key they answer 403. Contacts, contact notes, notifications, `@mention` ids on notes and `unassign` need the platform release from ErghiPlatform/Erghi PR #256, live on api.erghi.ai since 2026-11-16; a self-hosted platform older than that answers 404. Erasing a contact is permanent. No workspace id is ever passed; it comes from the credential.

- New: `client.insights` for Conversation Insights: `summary()`, `list_conversations()` and `export_csv()` with typed `InsightSummary`/`InsightPage` models. Needs the `view_insights` workspace permission, so use a signed-in Owner or Admin access token; API keys and client-credentials tokens get 403. On Starter, topics, categories and languages come back `None` and the summary's `locked` field names them.

## 2.0.0 (2026-11-05)

- Breaking: `Workspace` fields and `workspace.create(name, company_website=None)` changed; `update`/`delete` raise. The old calls hit endpoints that never existed.

- Fix: `auth` now talks to the platform's real auth endpoints. `refresh`, `me`,
  `verify_email`, `forgot_password` and `reset_password` called paths that do not exist, and
  `login`/`register` failed to parse the auth server's snake_case session. `RegisterRequest`
  and `LoginRequest` accept snake_case field names. While signup awaits email confirmation,
  `register` returns empty tokens.
- Fix: `workspace.list/get/create` use `/api/v1/accounts/workspaces`. `Workspace` is now
  `id, name, slug, is_current`, and `create(name, company_website=None)` replaces
  `create(name, slug)`. `update` and `delete` raise `NOT_SUPPORTED`; the API has no such
  endpoints.
- Error messages fall back to the platform's `error` text and the auth server's `msg`.

- `Message.source` ("voice" for a visitor voice note, whose `content` is the transcript).

## 1.0.0

- Initial release.
- Real-time chat backed by a hand-implemented SignalR wire protocol (negotiate + handshake + framed invocations) on top of `websockets`, since no official SignalR client exists for Python.
