# Erghi JavaScript/TypeScript SDK

Official JavaScript/TypeScript SDK for the [Erghi Platform](https://erghi.ai).

## Installation

```bash
npm install @erghi-ai/sdk
# or
yarn add @erghi-ai/sdk
# or
pnpm add @erghi-ai/sdk
```

## Quick Start

```typescript
import ErghiClient from '@erghi-ai/sdk';

// Initialize the client
const client = new ErghiClient({
  apiUrl: 'https://api.erghi.ai',
  apiKey: 'your-api-key',
  workspaceId: 'your-workspace-id',
});

// Register a new user
const authResponse = await client.auth.register({
  email: 'user@example.com',
  password: 'SecurePassword123!',
  firstName: 'John',
  lastName: 'Doe',
});

// Login
const loginResponse = await client.auth.login({
  email: 'user@example.com',
  password: 'SecurePassword123!',
});

// Get current user
const user = await client.auth.me();
console.log('Current user:', user);

// Create a conversation
const conversation = await client.chat.createConversation('widget-id', {
  page: window.location.href,
  userAgent: navigator.userAgent,
});

// Send a message
const message = await client.chat.sendMessage({
  conversationId: conversation.id,
  content: 'Hello, I need help!',
});

// Connect to WebSocket for real-time updates
client.connect();

client.on('message.received', (data) => {
  console.log('New message:', data);
});

client.on('user.typing', (data) => {
  console.log('User is typing...', data);
});
```

## Authentication

### Register

```typescript
const response = await client.auth.register({
  email: 'user@example.com',
  password: 'SecurePassword123!',
  firstName: 'John',
  lastName: 'Doe',
});
```

### Login

```typescript
const response = await client.auth.login({
  email: 'user@example.com',
  password: 'SecurePassword123!',
});
```

### Refresh Token

```typescript
const response = await client.auth.refresh('refresh-token');
```

### Logout

```typescript
await client.auth.logout();
```

## Chat Operations

### Create Conversation

```typescript
const conversation = await client.chat.createConversation('widget-id', {
  customData: 'value',
});
```

### Chatting as the end user (visitor)

`createConversation` returns a per-conversation `visitorToken` and the client keeps it.
Every later call for that conversation (messages, attachments, the visitor hub, identity
and secure context) sends it as `X-Visitor-Token` automatically. To resume a conversation
after a reload, persist `conv.id` and `conv.visitorToken` yourself and call
`client.setVisitorToken(id, token)`.

```typescript
const client = new ErghiClient({ apiUrl: 'https://api.staging.erghi.ai' }); // no API key
const conv = await client.chat.createConversation(widgetId, { locale: 'ar' }, { identityToken });

client.on('message.received', (m) => render(m));      // agent and AI replies
client.on('context.required', () => refreshSession());  // an integration needs fresh context
await client.connectVisitor(conv.id);

await client.chat.sendMessage({ conversationId: conv.id, content: 'When is my next payout?' });
await client.chat.sendMessage({ conversationId: conv.id, content: 'Receipt', attachments: [file] });
const history = await client.chat.getMessages(conv.id);
```

`closeConversation` and `markAsRead` are operator calls (access token or API key).

### Signed-in users and integration calls

```typescript
// identityToken: a JWT your backend signs with the workspace's widget secret.
const conv = await client.chat.createConversation(widgetId, { locale: 'ar' }, { identityToken });

// Values the AI never sees (bound in integrations as {{secret.<key>}}). Call again
// whenever your app refreshes its token; the conversation keeps going.
await client.chat.setSecureContext(conv.id, { mf_access_token: token }, { ttlSeconds: 900 });
await client.chat.attachIdentityToken(conv.id, freshIdentityJwt);
await client.chat.clearSecureContext(conv.id);
```

### Send Message

```typescript
const message = await client.chat.sendMessage({
  conversationId: 'conversation-id',
  content: 'Hello!',
});
```

### Send Message with Attachments

```typescript
const file = document.getElementById('file-input').files[0];

const message = await client.chat.sendMessage({
  conversationId: 'conversation-id',
  content: 'Here is the file',
  attachments: [file],
});
```

### Get Messages

```typescript
const response = await client.chat.getMessages('conversation-id', {
  page: 1,
  limit: 50,
  sort: 'createdAt',
  order: 'desc',
});

console.log(`Total messages: ${response.total}`);
response.data.forEach((message) => {
  console.log(`${message.sender}: ${message.content}`);
});
```

## WebSocket Real-time Events

```typescript
// Connect to WebSocket
client.connect();

// Listen for new messages
client.on('message.received', (message) => {
  console.log('New message:', message);
});

// Listen for typing indicators
client.on('user.typing', ({ conversationId, userId }) => {
  console.log(`User ${userId} is typing in conversation ${conversationId}`);
});

// Listen for conversation assignment
client.on('conversation.assigned', ({ conversationId, agentId }) => {
  console.log(`Conversation ${conversationId} assigned to agent ${agentId}`);
});

// Send typing indicator
client.chat.sendTyping('conversation-id');

// Disconnect
client.disconnect();
```

### Mobile apps (Capacitor)

On a visitor connection (`connectVisitor`), the client restarts the hub when a suspended webview
returns to the foreground, comes back online or is restored from the back/forward cache, then
emits `conversation.resumed`. Reload the messages then, because replies sent while the app was
suspended never reached the socket:

```typescript
client.on('conversation.resumed', async ({ conversationId }) => {
  const messages = await client.chat.getMessages(conversationId);
  render(messages);
});
```

## Identity Verification & Webhooks (Server-Side)

`generateIdentityHash` and `verifyWebhookSignature` are stateless helpers exported from the
package root — they don't need an `ErghiClient` instance. Only call them from your backend;
never ship your widget secret key or webhook secret to the browser.

```typescript
import { generateIdentityHash, verifyWebhookSignature } from '@erghi-ai/sdk';

// On your server, after the user logs in:
const identityHash = generateIdentityHash(currentUser.id, process.env.ERGHI_WIDGET_SECRET!);
// Send `identityHash` and `currentUser.id` to your frontend for use with the widget.

// In your webhook handler (use the raw body, not the parsed JSON):
app.post('/webhooks/erghi', express.text({ type: '*/*' }), (req, res) => {
  const signature = req.header('X-Erghi-Signature') ?? '';
  if (!verifyWebhookSignature(req.body, signature, process.env.ERGHI_WEBHOOK_SECRET!)) {
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(req.body);
  // ... handle event
  res.sendStatus(200);
});
```

## Workspace Management

```typescript
// List workspaces
const workspaces = await client.workspace.list();

// Create workspace
const workspace = await client.workspace.create({
  name: 'My Company',
  slug: 'my-company',
});

// Switch workspace
client.workspace.switchWorkspace('workspace-id');
```

## Error Handling

```typescript
import {
  AuthenticationError,
  ValidationError,
  RateLimitError,
  NetworkError,
  NotFoundError,
} from '@erghi-ai/sdk';

try {
  await client.auth.login({ email: 'invalid', password: 'wrong' });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Login failed:', error.message);
  } else if (error instanceof ValidationError) {
    console.error('Validation errors:', error.details);
  } else if (error instanceof RateLimitError) {
    console.error(`Rate limited. Retry after ${error.retryAfter}s`);
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
  } else if (error instanceof NotFoundError) {
    console.error('Resource not found');
  }
}
```

## TypeScript Support

The SDK is written in TypeScript and includes full type definitions:

```typescript
import type {
  User,
  Message,
  Conversation,
  AuthResponse,
  PaginatedResponse,
} from '@erghi-ai/sdk';

const user: User = await client.auth.me();
const messages: PaginatedResponse<Message> = await client.chat.getMessages('conv-id');
```

## Configuration

```typescript
const client = new ErghiClient({
  // API base URL (default: http://localhost:5000)
  apiUrl: 'https://api.erghi.ai',
  
  // WebSocket URL (default: ws://localhost:5002)
  wsUrl: 'wss://ws.erghi.ai',
  
  // API Key for authentication
  apiKey: 'your-api-key',
  
  // Access token (JWT)
  accessToken: 'your-access-token',
  
  // Workspace ID
  workspaceId: 'your-workspace-id',
  
  // Request timeout in milliseconds (default: 30000)
  timeout: 30000,
  
  // Enable debug logging (default: false)
  debug: true,
});
```

## Browser Usage

```html
<script src="https://cdn.erghi.ai/sdk/latest/erghi.min.js"></script>
<script>
  const client = new ErghiSDK.default({
    apiUrl: 'https://api.erghi.ai',
    apiKey: 'your-api-key',
  });

  client.auth.login({
    email: 'user@example.com',
    password: 'password',
  }).then((response) => {
    console.log('Logged in:', response.user);
  });
</script>
```

## Node.js Usage

```javascript
const ErghiClient = require('@erghi-ai/sdk').default;

const client = new ErghiClient({
  apiUrl: 'https://api.erghi.ai',
  apiKey: process.env.ERGHI_API_KEY,
});
```

## License

MIT
