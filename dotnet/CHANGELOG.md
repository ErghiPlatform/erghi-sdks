## Unreleased

- New: `client.Workforce` for the platform's Workforce API: own and forced agent status, the live board, away reasons, routing skills, per-agent profiles, workforce settings, chat offers (`ListMyOffersAsync`, `AcceptOfferAsync`, `DeclineOfferAsync`), the "why me" `GetRoutingDecisionAsync`, and the agent status, timeline and performance reports (plus CSV exports). `UpdateSettingsAsync` takes an `UpdateWorkforceSettingsRequest` and is a true partial update: null properties are not sent and keep their stored value, and `0` turns `IdleAwayMinutes`, `SignOutAfterHoursMinutes` or `AutoAwayAfterMissedOffers` off. `SaveAgentProfileAsync` is not partial: send the whole profile (an omitted `maxConcurrentChats` resets to the default, omitted `languages` clears them; only `skills` is left alone when null). Management calls take a `manage_workforce` API key; own status, offers and `GetRoutingDecisionAsync` need `view_conversations`, which a key can never hold, so they need a signed-in teammate's token. Reports need `view_insights` and a plan with workforce analytics (403 `plan_required` otherwise). The live board and the report bodies are returned as `JsonElement` because the server builds them ad hoc. Additive.

- New: `client.Social` for the Facebook and Instagram social inbox: connections, per-connection settings (partial update through `UpdateSocialConnectionSettingsRequest`), disconnect preview and disconnect, DM reply policy and delivery state, posts, comments (hide, unhide, public reply, private reply, mark done, ignore contact) and the social report (plus CSV). Moderation takes an API key with `moderate_social`; connections and settings need `configure_ai`; the report needs `view_insights`. A workspace without the social inbox gets 403 `social_inbox_unavailable`. Connecting an account is a browser-only Meta login and is deliberately not wrapped. Additive.

- New: `ErghiException.ServerCode` carries the server's machine-readable `code` (for example `offer_taken`, `private_reply_used`, `use_comment_reply`) for the workspace (admin) resources, and `ErghiException.Details` now holds the raw response body for status codes other than 400, 401, 404 and 429 (it was null). Messages, `Code` and `StatusCode` are unchanged. Additive.

## 3.2.0 (2026-11-18)

- Fix: conversation calls now work with an API key. Until now `ListConversationsAsync`, `SendMessageAsync` and the other conversation calls answered 403 "API keys cannot call this endpoint" (or 401 "User ID not found") when the client was built with `ClientId` and `ClientSecret`, because they called the signed-in-user endpoints. With a client id and secret they now call `/api/v1/agent/conversations` (list, get, messages, send, close), which needs the key's `chat:read` (list, get, messages) or `chat:write` (send, close) scope. Replies sent this way are agent messages with no teammate behind them, and the audit log records the key. Attachments are not supported with a key (`SendMessageWithAttachmentAsync` throws `ErghiException` with code `ATTACHMENTS_NOT_SUPPORTED_FOR_API_KEYS`); `markAsRead` and typing stay teammate/visitor calls. The workspace always comes from the key, never from a parameter. A signed-in teammate token or a visitor keeps using the existing endpoints unchanged. **Needs the platform release that adds `/api/v1/agent/conversations`**; an older platform answers 404 for a key client.

- Docs: `Conversation.Status` and `Message.Type` are strings exactly as the API sends them (`"Open"`, `"Queued"`, `"Text"`...; sender `"bot"` is the AI assistant). Compare case-insensitively. No behaviour change.

## 3.1.0 (2026-11-17)

- New: `client.Inbox` (labels, conversation labels, notes, saved replies, `UnassignAsync`) and `client.Contacts` (list, search, get, update, block, unblock, erase, contact notes, notifications, mentionable members) with typed records. Labels, conversation notes and saved replies work against the current platform and need `view_conversations` (writes to labels and saved replies need `manage_inbox_settings`); Workspace API keys cannot hold `view_conversations`, `manage_inbox_settings` or `manage_contacts` (not in the platform's grantable key scopes), so these calls need a signed-in teammate's access token; with an API key they answer 403. Contacts, contact notes, notifications, `@mention` ids on notes and `unassign` need the platform release from ErghiPlatform/Erghi PR #256, live on api.erghi.ai since 2026-11-16; a self-hosted platform older than that answers 404. Erasing a contact is permanent. No workspace id is ever passed; it comes from the credential.

- New: `client.Insights` for Conversation Insights: `SummaryAsync`, `ListConversationsAsync` and `ExportCsvAsync`, with `InsightFilter`, `InsightSummary` and `InsightPage` records. Needs the `view_insights` workspace permission, so use a signed-in Owner or Admin access token; API keys and client-credentials tokens get 403. On Starter, topics, categories and languages come back `null` and the summary's `Locked` list names them.

## 3.0.0 (2026-11-05)

- Breaking: `Workspace` and `CreateWorkspaceRequest` records changed and `UpdateAsync`/`DeleteAsync` are obsolete and throw. The old calls hit endpoints that never existed.

- Fix: `Auth` now talks to the platform's real auth endpoints. `RefreshAsync`, `MeAsync`,
  `ForgotPasswordAsync` and `ResetPasswordAsync` called paths that do not exist, and
  `LoginAsync`/`RegisterAsync` could not read the auth server's snake_case session. New
  `VerifyEmailAsync`. While signup awaits email confirmation, `RegisterAsync` returns empty
  tokens.
- Fix: `Chat.MarkAsReadAsync` posted to `/messages/read`, which does not exist; it now posts
  to `/api/conversations/{id}/read`.
- Fix: `Workspace.ListAsync/GetAsync/CreateAsync` use `/api/v1/accounts/workspaces`.
  `Workspace` is now `(Id, Name, Slug, IsCurrent)` and `CreateWorkspaceRequest` is
  `(Name, CompanyWebsite)`. `UpdateAsync` and `DeleteAsync` are obsolete and throw; the API
  has no such endpoints.
- Fix: a token from `LoginAsync` or a per-request `Authorization` header was overwritten by the
  configured `AccessToken`.
- Error messages fall back to the platform's `error` text and the auth server's `msg`.
