## Unreleased

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
