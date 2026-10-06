# Erghi Widget

Official embeddable chat widget for the [Erghi Platform](https://erghi.ai) — vanilla TypeScript (no UI framework), using the official `@microsoft/signalr` client for real-time delivery.

## Installation

### Option 1: CDN (Easiest)

```html
<script src="https://cdn.erghi.ai/widget.min.js" data-erghi="YOUR_WORKSPACE_ID"></script>
```

### Option 2: npm

```bash
npm install @erghi-ai/widget
```

```javascript
import ErghiWidget from '@erghi-ai/widget';

new ErghiWidget({
  workspace: 'YOUR_WORKSPACE_ID'
});
```

### Option 3: Manual

```html
<script src="path/to/erghi-widget.min.js"></script>
<script>
  new ErghiWidget({
    workspace: 'YOUR_WORKSPACE_ID'
  });
</script>
```

## Configuration

```javascript
new ErghiWidget({
  // Required
  workspace: 'ws_xxxxx',

  // Optional
  apiUrl: 'https://api.erghi.ai',  // Custom API URL (the hub URL is derived from this, not separately configurable)
  theme: 'light',  // 'light' | 'dark' | 'auto'
  position: 'bottom-right',  // 'bottom-left' | 'bottom-right'
  primaryColor: '#007bff',  // Brand color
  greeting: 'Hi! How can we help?',  // Initial message
  title: 'Support',  // Panel header title
  autoOpen: false,  // Auto-open on load
  direction: 'auto'  // 'auto' | 'ltr' | 'rtl' — 'auto' follows the visitor's locale (RTL for Arabic)
});
```

`theme`, `position`, `primaryColor`, `title` and `greeting` are overrides. Left out, the widget
uses the workspace's settings from `GET /api/widgets/{id}/public` (which also supplies the logo,
the corner radius and the accent colour), then the built-in defaults. Invalid values are ignored.
The script-tag equivalents are `data-theme`, `data-position`, `data-primary-color`, `data-title`
and `data-greeting`.

If the API doesn't answer within 3 seconds the widget appears anyway, with the overrides and the
defaults, rather than leaving the page without chat.

### Voice

Two workspace settings (admin portal, AI settings → Voice) turn on voice in the widget; nothing in
the embed is needed:

- **Voice input** adds a microphone button. The visitor records up to 60 seconds; the clip is
  transcribed and sent as their message (the agent sees a "voice note" badge). The audio is not
  stored. Usage counts against the plan's monthly voice minutes.
- **Read replies aloud** adds a speaker button to each reply. Speech is generated on the visitor's
  device by the browser's own engine, so it costs nothing and the text never leaves the device. The
  reply's language is detected on the device where the browser supports it, so an Arabic answer on
  an English page is still read with an Arabic voice.

What the host page needs for the microphone:

1. **HTTPS.** Browsers only allow microphone access on secure pages (`localhost` is exempt).
2. **No policy blocking it.** If your site sends a `Permissions-Policy` header, it must allow the
   microphone for your own origin, e.g. `Permissions-Policy: microphone=(self)`;
   with `microphone=()` the visitor gets a "microphone blocked" message instead of recording.
3. **Inside an iframe**, the iframe needs `allow="microphone"`.

The visitor's browser asks for permission the first time they press the button. When a browser
can't record (no `MediaRecorder`) the button doesn't appear.

**Native apps.** In a Capacitor or other webview you can hand recording and speech to native
plugins:

```javascript
new ErghiWidget({
  widgetId: 'w_xxxxx',
  // Return the clip (WebM, Ogg, MP4/M4A or WAV, at most 60 s), or null if cancelled.
  recordAudio: async () => myRecorderPlugin.recordClip(),
  // `language` is the reply's BCP 47 code; resolve when speaking finishes.
  speak: (text, language) => TextToSpeech.speak({ text, lang: language }),
  stopSpeaking: () => TextToSpeech.stop(),
});
```

Without hooks the widget uses the webview's `MediaRecorder` and `speechSynthesis`. Either way, on iOS add
`NSMicrophoneUsageDescription` to `Info.plist`, and on Android declare `RECORD_AUDIO` in the
manifest.

### Localization & RTL

The widget ships with built-in English, Arabic, and Spanish UI strings and full
right-to-left layout. With `direction: 'auto'` (the default) it detects the
visitor's locale from `localStorage('erghi:locale')`, `<html lang>`, or the
browser language — Arabic visitors automatically get a mirrored RTL layout with
Arabic system messages. Force a direction with `direction: 'rtl'` or the
`data-direction="rtl"` script attribute. Server-managed translations
(`/api/v1/i18n/translations?context=widget`) override the bundled strings.

## API Methods

```javascript
const widget = new ErghiWidget({ workspace: 'ws_xxx' });

// Open the chat window
widget.open();

// Close the chat window
widget.close();

// Toggle open/close
widget.toggle();

// Destroy the widget
widget.destroy();
```

## Signed-in users and integration calls

When your app has its own signed-in users, two things let Erghi's AI call your APIs on
that user's behalf without the visitor being able to pretend to be someone else.

```js
const widget = new ErghiWidget({
  workspace: 'ws_xxx',
  // A JWT your backend signs with the workspace's widget secret (HS256, `sub` and `exp`
  // required). Becomes {{identity.*}} in integration bindings and action policies.
  identityToken: await fetchErghiIdentityToken(),
  // Values the AI never sees, e.g. the user's own access token, bound as
  // {{secret.mf_access_token}}. Called again shortly before ttlSeconds runs out and
  // whenever an integration call needs fresh values, so the chat never restarts.
  secureContextProvider: async () => ({
    values: { mf_access_token: await auth.getAccessToken() },
    ttlSeconds: 900,
  }),
});

// Or push values yourself, e.g. right after your app refreshes its token:
await widget.setSecureContext({ mf_access_token: newToken }, { ttlSeconds: 900 });
await widget.setIdentityToken(newIdentityJwt);
await widget.clearSecureContext(); // on sign-out

// Without a provider, listen for the server asking for fresh values:
window.addEventListener('erghi:context-required', () => refreshAndPush());

// An identity JWT that is invalid or expired when the chat starts is dropped, and the
// conversation starts anonymously instead of failing. Attach a fresh one when you can:
window.addEventListener('erghi:identity-expired', async () =>
  widget.setIdentityToken(await auth.getErghiIdentityToken()));
```

Secure values are kept in memory only (never localStorage) and stored server-side
encrypted, with a TTL of 60 seconds to 24 hours.

## Examples

### Basic Usage

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Website</title>
</head>
<body>
  <h1>Welcome!</h1>
  
  <!-- Erghi Widget -->
  <script src="https://cdn.erghi.ai/widget.min.js"></script>
  <script>
    new ErghiWidget({
      workspace: 'ws_abc123',
      theme: 'light',
      primaryColor: '#ff6b6b',
      greeting: 'Welcome! Need any help?'
    });
  </script>
</body>
</html>
```

### Custom Styling

```javascript
new ErghiWidget({
  workspace: 'ws_abc123',
  theme: 'dark',
  primaryColor: '#8b5cf6',
  position: 'bottom-left'
});
```

### Auto-open Widget

```javascript
new ErghiWidget({
  workspace: 'ws_abc123',
  autoOpen: true,  // Opens immediately
  greeting: 'Hi there! 👋 How can we assist you today?'
});
```

### Programmatic Control

```javascript
const widget = new ErghiWidget({ workspace: 'ws_abc123' });

// Open after 5 seconds
setTimeout(() => {
  widget.open();
}, 5000);

// Close when user clicks a button
document.getElementById('closeChat').addEventListener('click', () => {
  widget.close();
});
```

### SPA Integration (React, Vue, Angular)

```javascript
// Initialize on component mount
useEffect(() => {
  const widget = new ErghiWidget({
    workspace: 'ws_abc123',
    theme: 'light'
  });

  // Cleanup on unmount
  return () => {
    widget.destroy();
  };
}, []);
```

### Mobile apps (Capacitor, Ionic, in-app webviews)

The widget runs unchanged inside a Capacitor webview. What to know:

- **Origins.** Capacitor pages load from `capacitor://localhost` (iOS) and `https://localhost`
  (Android). The widget's public endpoints and the visitor hub accept any origin without
  cookies, so there is nothing to allow-list.
- **Safe areas.** The launcher and the full-screen panel keep clear of the notch and home
  indicator using `env(safe-area-inset-*)`, which is only non-zero when the page opts in:

  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  ```

- **Keyboard.** The panel sizes itself with `100dvh`, so it follows the visible area when the
  keyboard opens. Keep the `@capacitor/keyboard` plugin's resize mode on `native` or `body`
  (not `none`), or the input can end up behind the keyboard.
- **Backgrounding.** The OS suspends the webview in the background and drops the socket. When the
  app returns to the foreground (or the device comes back online) the widget reconnects and
  fetches any replies that arrived meanwhile; no app code is needed.
- **Links.** Footer and source links open with `target="_blank"`. Capacitor opens links to other
  hosts in the system browser by default; don't add those hosts to `server.allowNavigation`, or
  they will replace your app's page.
- **Storage.** The open conversation is remembered in `localStorage`. iOS can clear webview
  storage when the device is low on space, which only means the visitor starts a new chat.
- **Signed-in users.** Mint the identity token on your server, never in the app bundle; see
  [Signed-in users and integration calls](#signed-in-users-and-integration-calls).

## Features

✅ **Vanilla TypeScript** - No UI framework, bundles `@microsoft/signalr` for real-time delivery  
✅ **Lightweight** - ~23KB gzipped  
✅ **Real-time** - SignalR WebSocket connection  
✅ **Responsive** - Mobile-friendly design  
✅ **Customizable** - Match your brand colors  
✅ **TypeScript** - Full type definitions included  
✅ **Cross-browser** - Works on all modern browsers  

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Development

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Development mode with watch
npm run dev

# Run tests
npm test
```

## License

MIT
