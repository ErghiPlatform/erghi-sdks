## Unreleased

- `chat.createConversation(widgetId, metadata, { identityToken })`, plus
  `chat.attachIdentityToken`, `chat.setSecureContext` and `chat.clearSecureContext`.
  `Conversation.visitorToken` is now typed (returned by create only).

## 1.0.0

- Initial release.
- Real-time chat backed by the official `@microsoft/signalr` client.
