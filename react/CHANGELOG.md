## Unreleased

- No code change. `@erghi-ai/sdk` 2.2.0 widens the `Conversation`/`Message` types to the PascalCase values the API sends and routes API-key conversation calls to the key-scoped endpoints; the hooks inherit both.

- Gap, not implemented (maintenance tier): the inbox and contacts API (labels, notes, saved replies, contacts, notifications). Use the JavaScript SDK from your server. Recorded in `parity.json`.

- No code change. Conversation Insights are available as `useErghi().client.insights` once `@erghi-ai/sdk` ships `insights` (see its changelog); this package has no hook for them.

## 2.0.0 (2026-11-05)

- Breaking: re-exports `Workspace` from `@erghi-ai/sdk` 2.0.0, whose shape changed. Requires `@erghi-ai/sdk` ^2.0.0.

- `useChat` joins the visitor hub when the client holds the conversation's visitor token
  (end-user chat) and the agent hub otherwise; `isConnected` now follows the real connection
  state, and a message already in the list is not appended twice. Requires the next
  `@erghi-ai/sdk` release (`connectVisitor`); publish that first and bump the dependency.

## 1.0.1

- Fix package description metadata (no functional changes).

## 1.0.0

- Initial release.
- Real-time hooks backed by `@erghi-ai/sdk`'s real SignalR transport.
