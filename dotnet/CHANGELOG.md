## Unreleased

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
