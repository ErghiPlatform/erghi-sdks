## 1.5.0 (2026-11-20)

- Added: a pre-chat form. When the workspace turns it on for a widget (`preChatFormEnabled` in the
  public config), the widget asks for an optional name and email before the first message; either
  can be required (`preChatNameRequired`, `preChatEmailRequired`), which hides the skip link. The
  values travel only with the request that creates the conversation and are never stored. The form
  is not shown to a visitor identified by the host page (identity token or hash) or when a saved
  conversation resumes. Shadow DOM, RTL, all six languages.

## 1.4.0 (2026-11-18)

- Changed: opening the chat no longer creates a conversation. The first message does, so visitors
  who only look leave nothing in the inbox. A saved conversation still resumes on open.
- The conversation now carries pageUrl and referrer (origin and path only, no query string or
  fragment, capped at 500 characters).
- A deactivated widget or a refused origin shows a clear notice and disables the composer instead of
  a generic connection error. A rate limit (429) on send or upload and a message over 4000
  characters now get their own text (all six languages).
- Retrying a failed message removes its "failed to send" notice.
- The ended-conversation notice now says that sending a message starts a new chat.

## 1.3.1 (2026-11-18)

- Fixed: a rejected attachment (for example an unsupported file type) no longer breaks the chat.
  The file is dropped, the visitor sees the server's reason, and the next message sends normally.
  Before, the same file was uploaded again with every later message and every send failed until
  the page was reloaded. Only a permanent refusal (bad request, too large, wrong type) drops the
  file; a rate limit, timeout or server error keeps it for Retry.
- A picked file now shows as a chip above the input with its name and a remove button. One file
  goes with each message; picking another replaces it.
- A message that fails to send is marked as unsent and has a Retry button.
- The chat no longer picks up the host page's inherited text styles (text-transform, letter-spacing,
  line-height, font settings), which could uppercase or space out all widget text and break
  connected Arabic script. Font, direction and size are still set by the widget.
- The "You're #N in the queue" line (and the "connecting" line) disappear once an agent joins.
- Arabic default greeting is now Modern Standard Arabic instead of Egyptian dialect.
- New strings (Retry, remove file, one file per message, attachment error) are translated in
  every bundled language. No API or configuration change.

## 1.3.0 (2026-11-17)

- Shows the workspace's campaigns (proactive messages set up under Campaigns in the Erghi
  dashboard). After the campaign's delay, on a page whose address matches, the message appears
  in the chat and in a small note beside the closed launcher, which the visitor can dismiss.
  Each campaign shows once per browser, only to visitors without an open conversation.
- Reading a campaign creates nothing. The visitor's first reply starts the conversation and
  links it to the campaign, so the dashboard can count the conversations each one started.
- Campaign messages carry no AI label and no rating buttons. Text only, never markup; page
  addresses are compared as plain text (a value starting with `/` against the path).
- Links in system messages (the satisfaction-survey link sent when a conversation closes, the
  welcome message) are now clickable and open in a new tab. Only `https://` URLs become links;
  AI and agent replies still never contain links.

## 1.2.1 (2026-11-13)

- AI and agent replies now render bold, italic, inline code, line breaks and simple lists
  instead of showing literal `**` and `*` markers. Built with DOM nodes only, so HTML in a
  reply stays plain text; works for right-to-left and mixed Arabic/English text.

## 1.2.0 (2026-11-06)

- Follows the workspace's new "Chat features" settings: the attach button is hidden when
  visitor attachments are off, and the thumbs under AI replies are hidden when reply ratings
  are off. Both default to on, so an older API changes nothing.
- On plans that don't remove branding (Free), the footer shows a "Powered by Erghi" link,
  localized in all six languages.

## 1.1.1 (2026-11-06)

- Security: the SignalR client now logs at Warning instead of its default Information level.
  At Information it printed the hub's WebSocket URL, including the visitor's conversation
  token, into the browser console of every site embedding the widget. Failed connections and
  reconnects are still logged.

## 1.1.0 (2026-11-05)

- `locale` option (`data-locale` on the script tag): the widget's language, e.g. your app's
  chosen language. It wins over the page's `lang` and the browser language, sets the widget's
  text and direction, and is the language the assistant replies in when it can't tell the
  visitor's language from the message.
- `npm run lint` works again (ESLint 9 flat config).

- Reply buttons: AI replies can carry up to four buttons (`reply`, `link`, `app`, `handoff`)
  when the workspace turns them on. New `onAction` config callback and cancelable
  `erghi:action` window event let the host app handle a tap, e.g. route an `app` deep link.
  Labels are rendered as text; script and plain-http URLs are never opened.
- `destroy({ clearSession: true })` also removes the stored conversation from the device and
  clears the secure context on the server, for sign-out on shared devices. `destroy()` now
  returns a promise; calling it without `await` works as before.
- The "microphone blocked" message now points to browser *or device* settings, since in an app
  the permission lives in the device's settings. The README lists what an app needs for voice.

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
