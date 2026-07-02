# Erghi Widget

Embeddable chat widget for websites - No dependencies, pure Vanilla JavaScript with TypeScript.

## Installation

### Option 1: CDN (Easiest)

```html
<script src="https://cdn.erghi.com/widget.min.js" data-erghi="YOUR_WORKSPACE_ID"></script>
```

### Option 2: npm

```bash
npm install @erghi/widget
```

```javascript
import ErghiWidget from '@erghi/widget';

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
  apiUrl: 'https://api.erghi.com',  // Custom API URL
  signalrUrl: 'https://api.erghi.com/hubs/chat',  // Custom SignalR URL
  theme: 'light',  // 'light' | 'dark' | 'auto'
  position: 'bottom-right',  // 'bottom-left' | 'bottom-right'
  primaryColor: '#007bff',  // Brand color
  greeting: 'Hi! How can we help?',  // Initial message
  avatar: 'https://example.com/avatar.png',  // Support avatar
  autoOpen: false  // Auto-open on load
});
```

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
  <script src="https://cdn.erghi.com/widget.min.js"></script>
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
  position: 'bottom-left',
  avatar: '/img/support-avatar.png'
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

✅ **Zero Dependencies** - Pure Vanilla JS, no libraries required  
✅ **Lightweight** - < 50KB gzipped  
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
