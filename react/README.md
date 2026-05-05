# ChatFlow React SDK

React hooks and components for the [ChatFlow Platform](https://chatflow.com).

## Installation

```bash
npm install @aichat/react @aichat/sdk
```

## Quick Start

```tsx
import { AIChatProvider, useAuth, useChat } from '@aichat/react';

function App() {
  return (
    <AIChatProvider
      config={{
        apiUrl: 'https://api.chatflow.com',
        apiKey: 'your-api-key',
      }}
    >
      <YourApp />
    </AIChatProvider>
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
import type { User, Message, Conversation } from '@aichat/react';

const user: User = useAuth().user!;
const messages: Message[] = useChat('conv-id').messages;
```

## License

MIT
