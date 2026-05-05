# ChatFlow JavaScript/TypeScript SDK

Official JavaScript/TypeScript SDK for the [ChatFlow Platform](https://chatflow.com).

## Installation

```bash
npm install @aichat/sdk
# or
yarn add @aichat/sdk
# or
pnpm add @aichat/sdk
```

## Quick Start

```typescript
import AIChatClient from '@aichat/sdk';

// Initialize the client
const client = new AIChatClient({
  apiUrl: 'https://api.chatflow.com',
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
} from '@aichat/sdk';

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
} from '@aichat/sdk';

const user: User = await client.auth.me();
const messages: PaginatedResponse<Message> = await client.chat.getMessages('conv-id');
```

## Configuration

```typescript
const client = new AIChatClient({
  // API base URL (default: http://localhost:5000)
  apiUrl: 'https://api.chatflow.com',
  
  // WebSocket URL (default: ws://localhost:5002)
  wsUrl: 'wss://ws.chatflow.com',
  
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
<script src="https://cdn.chatflow.com/sdk/latest/chatflow.min.js"></script>
<script>
  const client = new AIChatSDK.default({
    apiUrl: 'https://api.chatflow.com',
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
const AIChatClient = require('@aichat/sdk').default;

const client = new AIChatClient({
  apiUrl: 'https://api.chatflow.com',
  apiKey: process.env.CHATFLOW_API_KEY,
});
```

## License

MIT
