/**
 * Erghi React SDK — Simulation / Demo App
 *
 * A complete working chat UI that exercises the React SDK against
 * a locally running Erghi stack (http://localhost:5000).
 *
 * Add this component to a Create-React-App or Vite project that has the
 * @erghi/react-sdk package installed (or use the local source via path alias).
 */

import React, { useState, useEffect, useRef, FormEvent } from 'react';
import { ErghiProvider, useAuth, useChat, useWebSocket } from '../src';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  sender: string;
  content: string;
  createdAt: string;
}

// ─── AuthForm ───────────────────────────────────────────────────────────────

function AuthForm({ onAuthenticated }: { onAuthenticated: (convId: string) => void }) {
  const { register, login, isAuthenticated, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('Demo');
  const [isRegistering, setIsRegistering] = useState(true);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegistering) {
        await register({ email, password, firstName, lastName: 'User' });
      } else {
        await login({ email, password });
      }
      // After auth, create a conversation (widgetId comes from your workspace)
      onAuthenticated('placeholder-conv-id');
    } catch (err: any) {
      setError(err.message ?? 'Authentication failed');
    }
  };

  if (isAuthenticated && user) {
    return (
      <div style={styles.panel}>
        <p style={styles.success}>✓ Logged in as <strong>{user.email}</strong></p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h2 style={styles.heading}>Erghi {isRegistering ? 'Register' : 'Login'}</h2>

      {isRegistering && (
        <input
          style={styles.input}
          placeholder="First Name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
      )}
      <input
        style={styles.input}
        type="email"
        placeholder="Email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        style={styles.input}
        type="password"
        placeholder="Password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {error && <p style={styles.error}>{error}</p>}

      <button style={styles.button} type="submit">
        {isRegistering ? 'Register' : 'Login'}
      </button>

      <p style={styles.toggle}>
        {isRegistering ? 'Already have an account? ' : "Don't have an account? "}
        <button
          type="button"
          style={styles.link}
          onClick={() => setIsRegistering(!isRegistering)}
        >
          {isRegistering ? 'Login' : 'Register'}
        </button>
      </p>
    </form>
  );
}

// ─── ChatWindow ─────────────────────────────────────────────────────────────

function ChatWindow({ conversationId }: { conversationId: string }) {
  const { messages, sendMessage, isLoading, markAsRead } = useChat(conversationId);
  const { isConnected, sendTyping } = useWebSocket();
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<number | null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    markAsRead();
  }, [messages]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    try {
      await sendMessage({ content: text });
    } catch (err: any) {
      console.error('Send failed:', err.message);
    }
  };

  const handleTyping = (value: string) => {
    setInput(value);

    if (!isTyping) {
      setIsTyping(true);
      sendTyping(conversationId, true);
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      setIsTyping(false);
      sendTyping(conversationId, false);
    }, 1000);
  };

  return (
    <div style={styles.chatWindow}>
      {/* Header */}
      <div style={styles.chatHeader}>
        <span>Erghi Demo</span>
        <span style={{ ...styles.badge, background: isConnected ? '#22c55e' : '#ef4444' }}>
          {isConnected ? '● Connected' : '○ Offline'}
        </span>
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {isLoading && <p style={styles.hint}>Loading messages…</p>}
        {(messages as Message[]).map((msg) => (
          <div
            key={msg.id}
            style={{
              ...styles.bubble,
              alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              background: msg.sender === 'user' ? '#6366f1' : '#f3f4f6',
              color: msg.sender === 'user' ? '#fff' : '#111',
            }}
          >
            <strong>{msg.sender}</strong>
            <p style={{ margin: '4px 0 0' }}>{msg.content}</p>
            <small style={{ opacity: 0.6 }}>
              {new Date(msg.createdAt).toLocaleTimeString()}
            </small>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} style={styles.inputRow}>
        <input
          style={{ ...styles.input, flex: 1, marginBottom: 0 }}
          placeholder="Type a message…"
          value={input}
          onChange={(e) => handleTyping(e.target.value)}
        />
        <button style={styles.sendButton} type="submit" disabled={!input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

// ─── Root simulation component ───────────────────────────────────────────────

function SimulationInner() {
  const { isAuthenticated } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);

  return (
    <div style={styles.root}>
      {!isAuthenticated || !conversationId ? (
        <AuthForm onAuthenticated={setConversationId} />
      ) : (
        <ChatWindow conversationId={conversationId} />
      )}
    </div>
  );
}

// ─── Exported app wrapped in the provider ───────────────────────────────────

export default function SimulationApp() {
  return (
    <ErghiProvider config={{ apiUrl: 'http://localhost:5000', debug: true }}>
      <SimulationInner />
    </ErghiProvider>
  );
}

// ─── Inline styles ───────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f8fafc',
    fontFamily: 'system-ui, sans-serif',
  },
  form: {
    background: '#fff',
    padding: '2rem',
    borderRadius: '1rem',
    boxShadow: '0 4px 24px rgba(0,0,0,.1)',
    width: 360,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  heading: { margin: 0, fontSize: '1.4rem', color: '#1e1b4b' },
  input: {
    padding: '0.65rem 0.9rem',
    borderRadius: '0.5rem',
    border: '1px solid #d1d5db',
    fontSize: '0.95rem',
    outline: 'none',
    marginBottom: '0.25rem',
    width: '100%',
    boxSizing: 'border-box',
  },
  button: {
    padding: '0.7rem',
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '1rem',
  },
  error: { color: '#ef4444', margin: 0, fontSize: '0.875rem' },
  success: { color: '#22c55e', margin: 0 },
  panel: {
    background: '#fff',
    padding: '1rem 1.5rem',
    borderRadius: '0.75rem',
    boxShadow: '0 2px 8px rgba(0,0,0,.08)',
  },
  toggle: { textAlign: 'center', margin: 0, fontSize: '0.875rem' },
  link: {
    background: 'none',
    border: 'none',
    color: '#6366f1',
    cursor: 'pointer',
    fontWeight: 600,
    padding: 0,
  },
  chatWindow: {
    width: 420,
    height: 600,
    background: '#fff',
    borderRadius: '1rem',
    boxShadow: '0 4px 24px rgba(0,0,0,.12)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  chatHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.9rem 1.2rem',
    background: '#6366f1',
    color: '#fff',
    fontWeight: 600,
    fontSize: '1rem',
  },
  badge: {
    fontSize: '0.75rem',
    padding: '0.2rem 0.6rem',
    borderRadius: '9999px',
    fontWeight: 400,
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  bubble: {
    maxWidth: '80%',
    padding: '0.6rem 0.9rem',
    borderRadius: '0.75rem',
    fontSize: '0.9rem',
  },
  hint: { color: '#9ca3af', textAlign: 'center', fontSize: '0.875rem', margin: 0 },
  inputRow: {
    display: 'flex',
    gap: '0.5rem',
    padding: '0.75rem',
    borderTop: '1px solid #e5e7eb',
  },
  sendButton: {
    padding: '0 1rem',
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontWeight: 600,
  },
};
