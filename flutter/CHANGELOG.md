## Unreleased

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
