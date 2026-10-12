## Unreleased

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
