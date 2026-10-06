## Unreleased

- The typing indicator follows the server's reply turn: it stays on while the visitor sends
  several messages in a row and disappears with the single reply to all of them. Once the
  server reports it is generating, the widget waits up to 90 s (the server's budget) before
  showing the "trouble getting a response" notice, instead of 30 s from the last message.
- Voice, when the workspace turns it on: a microphone button sends voice notes (transcribed
  into the visitor's message), and a speaker button reads replies aloud with the device's own
  speech engine, in the reply's language. `recordAudio`, `speak` and `stopSpeaking` hooks let
  native apps use their own recorder and text-to-speech.
- Mobile webviews (Capacitor, in-app browsers): after the app returns from the background or
  the device comes back online, the widget reconnects and fetches replies it missed while
  suspended. The launcher and full-screen panel respect safe-area insets, and the panel sizes
  with `100dvh` so it follows the on-screen keyboard.

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
