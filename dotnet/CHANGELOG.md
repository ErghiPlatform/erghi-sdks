## Unreleased

- New: `client.Inbox` (labels, conversation labels, notes, saved replies, `UnassignAsync`) and `client.Contacts` (list, search, get, update, block, unblock, erase, contact notes, notifications, mentionable members) with typed records. Labels, conversation notes and saved replies work against the current platform and need `view_conversations` (writes to labels and saved replies need `manage_inbox_settings`); Workspace API keys cannot hold `view_conversations`, `manage_inbox_settings` or `manage_contacts` (not in the platform's grantable key scopes), so these calls need a signed-in teammate's access token; with an API key they answer 403. Contacts, contact notes, notifications, `@mention` ids on notes and `unassign` require platform PR #256 and answer 404 until it ships. Erasing a contact is permanent. No workspace id is ever passed; it comes from the credential.

- New: `client.Insights` for Conversation Insights: `SummaryAsync`, `ListConversationsAsync` and `ExportCsvAsync`, with `InsightFilter`, `InsightSummary` and `InsightPage` records. Needs the `view_insights` workspace permission, so use a signed-in Owner or Admin access token; API keys and client-credentials tokens get 403.

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
