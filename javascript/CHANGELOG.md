## Unreleased

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
