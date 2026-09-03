# Erghi React SDK

Official React SDK for the [Erghi Platform](https://erghi.ai) — hooks and components for real-time chat.

> **🟡 Maintenance tier.** This package is real, working, tested code and stays that way — it
> gets bug fixes and security patches — but it is not getting proactive build investment ahead of
> the underlying [`@erghi-ai/sdk`](../javascript) it wraps. Neither Chatwoot nor Intercom, the
> closest comparable competitors at Erghi's current stage, maintain framework wrappers around
> their vanilla widget, and this package is exactly that kind of wrapper. If a hook you need
> doesn't exist yet, `useErghi().client` gives you the full underlying SDK client directly — see
> [PARITY.md](../PARITY.md) and [`parity.json`](./parity.json) for exactly what's covered.

## Installation

```bash
npm install @erghi-ai/react @erghi-ai/sdk
```

## Quick Start

```tsx
import { ErghiProvider, useAuth, useChat } from '@erghi-ai/react';

function App() {
  return (
    <ErghiProvider
      config={{
        apiUrl: 'https://api.erghi.ai',
        apiKey: 'your-api-key',
      }}
    >
      <YourApp />
    </ErghiProvider>
  );
}

function YourApp() {
  const { user, isAuthenticated, login, logout } = useAuth();

  if (!isAuthenticated) {
    return (
      <LoginForm
        onSubmit={(credentials) => login(credentials)}
      />
    );
  }

  return (
    <div>
      <h1>Welcome, {user?.firstName}!</h1>
      <button onClick={logout}>Logout</button>
      <ChatInterface />
    </div>
  );
}

function ChatInterface() {
  const { messages, sendMessage, isConnected } = useChat('conversation-id');

  return (
    <div>
      <div>Status: {isConnected ? 'Connected' : 'Disconnected'}</div>
      
      <div>
        {messages.map((msg) => (
          <div key={msg.id}>
            <strong>{msg.sender}:</strong> {msg.content}
          </div>
        ))}
      </div>
      
      <input
        onKeyPress={(e) => {
          if (e.key === 'Enter') {
            sendMessage(e.currentTarget.value);
            e.currentTarget.value = '';
          }
        }}
      />
    </div>
  );
}
```

## Hooks

### useAuth

```tsx
const {
  user,
  isAuthenticated,
  isLoading,
  error,
  login,
  register,
  logout,
} = useAuth();

// Login
await login({
  email: 'user@example.com',
  password: 'password',
});

// Register
await register({
  email: 'user@example.com',
  password: 'password',
  firstName: 'John',
  lastName: 'Doe',
});

// Logout
await logout();
```

### useChat

```tsx
const {
  messages,
  isLoading,
  error,
  isConnected,
  sendMessage,
  sendTyping,
} = useChat('conversation-id');

// Send message
await sendMessage('Hello!');

// Send typing indicator
sendTyping();
```

### useWebSocket

```tsx
const { isConnected, connect, disconnect, subscribe } = useWebSocket();

// Subscribe to events
useEffect(() => {
  const unsubscribe = subscribe('message.received', (message) => {
    console.log('New message:', message);
  });

  return unsubscribe;
}, [subscribe]);
```

## TypeScript Support

Fully typed with TypeScript:

```tsx
import type { User, Message, Conversation } from '@erghi-ai/react';

const user: User = useAuth().user!;
const messages: Message[] = useChat('conv-id').messages;
```

## License

MIT
