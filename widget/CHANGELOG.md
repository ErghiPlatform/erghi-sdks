## Unreleased

- An identity token the server rejects (e.g. expired before the visitor opened the chat)
  no longer blocks the chat: the conversation starts without it and the widget dispatches
  `erghi:identity-expired` so the host app can attach a fresh one with `setIdentityToken`.

- Signed-in users: `identityToken` config and `setIdentityToken()` give the conversation a
  verified identity; `setSecureContext()` / `clearSecureContext()` and a
  `secureContextProvider` pass values (such as the user's access token) that integration
  calls can use but the AI never sees, refreshed before they expire and when the server
  sends `ContextRequired` (also re-dispatched as the `erghi:context-required` window event).
- Use the workspace's branding: logo, theme (light/dark/auto), position, corner radius, and the
  secondary colour as an accent (focus rings, source links, typing dots, unread dot). Script-tag
  attributes still override, and `data-theme` is now read.
- Real dark theme, including `auto` following the visitor's system setting.
- Start-up requests give up after 3 s so a slow API can't keep the widget from appearing.
- Colours are accepted only as hex, so a bad value can't break or inject into the widget's CSS.

## 1.0.1

- Fix package description metadata (no functional changes).

## 1.0.0

- Initial release.
