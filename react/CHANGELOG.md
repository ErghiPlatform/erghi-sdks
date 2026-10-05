## Unreleased

- `useChat` joins the visitor hub when the client holds the conversation's visitor token
  (end-user chat) and the agent hub otherwise; `isConnected` now follows the real connection
  state, and a message already in the list is not appended twice. Requires the next
  `@erghi-ai/sdk` release (`connectVisitor`); publish that first and bump the dependency.

## 1.0.1

- Fix package description metadata (no functional changes).

## 1.0.0

- Initial release.
- Real-time hooks backed by `@erghi-ai/sdk`'s real SignalR transport.
