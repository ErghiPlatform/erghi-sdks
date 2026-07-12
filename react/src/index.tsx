export { ErghiProvider, useErghi } from './context';
export { useAuth } from './useAuth';
export { useChat } from './useChat';
export { useWebSocket } from './useWebSocket';

// Re-export types from base SDK
export type {
  ErghiConfig,
  User,
  AuthResponse,
  Message,
  Conversation,
  Workspace,
} from '@erghi/sdk';
