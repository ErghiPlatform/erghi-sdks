## 2.4.0 (2026-11-24)

- New: contact merge on `client.contacts`: `list_merge_suggestions()` (pairs that share a verified email or phone number, never a name; at most 100), `merge(target_contact_id, source_contact_id)` and `dismiss_merge_suggestion(contact_a_id, contact_b_id)`. `merge` is **irreversible**: the source contact's conversations, notes and channel identities move to the target, and the source contact is deleted. It needs a signed-in teammate's token with `manage_contacts` who can see every conversation; a teammate limited to some inboxes gets 403 `contact_out_of_scope`, and an API key gets 403 (`manage_contacts` is never grantable to a key). A conflict raises `ErghiError` with status 409 and `details["code"] == "merge_conflicting_identities"`. New models `MergeContact`, `ContactMergeSuggestion`, `ContactMergeResult`. Needs the platform release that adds these routes (the Erghi deploy planned for 1 December); an older platform answers 404.
- New: `client.social.list_inbox_connections()` reads `GET /api/v1/social/connections`: the connected Pages and Instagram accounts with only id, channel, name and status, for callers that can moderate but lack `configure_ai`. `list_connections()` is unchanged. New model `SocialInboxConnection`. Needs the platform release that adds these routes (the Erghi deploy planned for 1 December); an older platform answers 404.
- Fix: `erghi.__version__` said `2.2.0` in the 2.3.0 release; it now matches the package version.

## 2.3.0 (2026-11-24)

- New: reply engine. Let your own agent answer a widget's visitors instead of Erghi AI.
  - `client.reply_engines` (admin, needs `configure_ai`): list, list_names, get, create, update, delete, enable, disable, rotate_secret, test, health, list_turns, get_widget_binding, set_widget_binding. Typed pydantic models (`ReplyEngine`, `ReplyEngineWrite`, `ReplyEngineHealth`...). The `whsec_` signing secret is returned once, on create and rotate_secret.
  - `client.agent_runtime` (needs an API key with `agent:runtime`): get_turn, reply, typing, handoff, decline, take_back, post_bot_message. `AgentReply.of(key, "text")` builds a reply; reuse the idempotency key when you retry.
  - `verify_webhook`, `is_valid_webhook`, `parse_turn_webhook` and `sign_webhook`: Standard Webhooks verification (`webhook-id`, `webhook-timestamp`, `webhook-signature`; HMAC-SHA256 of `{id}.{timestamp}.{body}`; constant-time compare; 5 minute tolerance; several `v1,` signatures accepted during a secret rotation). Also valid for workspace webhooks.
  - New `ApiError` (a subclass of `ErghiError`, still `code == "API_ERROR"`) for 403/409 and other statuses the SDK did not map before; it adds `error_code` (the platform's machine code, for example `turn_closed`) and `reason`. Code that caught `ErghiError` keeps working.
  - Not in this SDK: the live-connection (SignalR) client; use the REST runtime calls or the webhook mode. Needs the platform release with reply engines (API version 2026-11-22).
- Known issue, not changed here: `verify_webhook_signature` (the older helper) checks `X-Erghi-Signature` over the body only, which is not how the platform signs deliveries today; use `verify_webhook` for real webhook deliveries.
- Fix: the wheel did not contain the `erghi.resources` package (`[tool.setuptools] packages` listed only `erghi`), so `import erghi` failed on an installed 2.2.0 and earlier with `ModuleNotFoundError: erghi.resources`. Both packages are now listed; verified by building the wheel. This fix needs a release of its own soon, regardless of the reply engine.
- New: `client.workforce` for the platform's Workforce API: own and forced agent status, the live board, away reasons, routing skills, per-agent profiles, workforce settings, chat offers (`list_my_offers`, `accept_offer`, `decline_offer`), the "why me" `get_routing_decision`, and the agent status, timeline and performance reports (plus CSV exports). `update_settings` is a true partial update: only the arguments you pass are sent, so everything else keeps its stored value, and `0` turns `idle_away_minutes`, `sign_out_after_hours_minutes` or `auto_away_after_missed_offers` off. `save_agent_profile` is not partial: send the whole profile (an omitted `max_concurrent_chats` resets to the default, an omitted `languages` clears them; only `skills` is left alone when omitted). Management calls take a `manage_workforce` API key; own status, offers and `get_routing_decision` need `view_conversations`, which a key can never hold, so they need a signed-in teammate's token. Reports need `view_insights` and a plan with workforce analytics (403 `plan_required` otherwise). Additive.

- New: `client.social` for the Facebook and Instagram social inbox: connections, per-connection settings (partial update), disconnect preview and disconnect, DM reply policy and delivery state, posts, comments (hide, unhide, public reply, private reply, mark done, ignore contact) and the social report (plus CSV). Moderation takes an API key with `moderate_social`; connections and settings need `configure_ai`; the report needs `view_insights`. A workspace without the social inbox gets 403 `social_inbox_unavailable`. Connecting an account is a browser-only Meta login and is deliberately not wrapped. Additive.

- Change: for 403, 409 and other non-validation errors the raised `ErghiError.details` is now the parsed response body (it was `None` unless the body had an `errors` field), so the server's machine code is available as `error.details["code"]` (for example `offer_taken`, `private_reply_used`, `use_comment_reply`). Messages, codes and status codes are unchanged; code that never read `details` is unaffected.

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
