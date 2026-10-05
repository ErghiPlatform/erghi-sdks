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
