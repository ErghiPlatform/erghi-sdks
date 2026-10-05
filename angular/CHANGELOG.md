## Unreleased

- `SignalRService.connectVisitor` restarts the hub when a suspended mobile webview resumes
  (visible, online, or restored from the back/forward cache) and emits a `resumed` event so the
  app can reload messages missed meanwhile.

- `ChatService.createConversation(widgetId, metadata, identityToken)`, plus
  `attachIdentityToken`, `setSecureContext` and `clearSecureContext`.
  `Conversation.visitorToken` is now typed (returned by create only).
- Visitor chat: `ChatService` keeps each conversation's visitor token and sends
  `X-Visitor-Token` on visitor calls; `sendMessage` takes optional files (uploaded first via
  the new `uploadAttachment`); `SignalRService.connectVisitor(conversationId)` joins
  `/hubs/visitor`.
- Fix: `SignalRService` listened for `ReceiveMessage`, an event the server never sends, so
  no message ever arrived in real time; it now handles `MessageReceived`, plus closed,
  assigned, escalated, inactivity-warning and context-required events.

## 1.0.1

- Fix package description metadata (no functional changes).

## 1.0.0

- Initial release.
