import * as signalR from '@microsoft/signalr';

export type RealtimeMessage = {
  id: string;
  content: string;
  sender: string;
  createdAt?: string;
  isAI?: boolean;
};

export type RealtimeHandlers = {
  onMessage: (message: RealtimeMessage) => void;
  onClosed?: () => void;
  onStateChange?: (connected: boolean) => void;
  onEscalated?: (payload: { queuePosition: number }) => void;
  onAssigned?: (payload: { agentName: string }) => void;
  onInactivityWarning?: (payload: { secondsUntilClose: number }) => void;
};

export class ConversationRealtimeClient {
  private hub: signalR.HubConnection | null = null;
  private handlers: RealtimeHandlers | null = null;

  async connect(apiUrl: string, conversationId: string, handlers: RealtimeHandlers): Promise<void> {
    this.handlers = handlers;
    await this.disconnect();

    const hubUrl = `${apiUrl.replace(/\/$/, '')}/hubs/visitor?conversationId=${encodeURIComponent(conversationId)}`;
    this.hub = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .build();

    this.hub.on('MessageReceived', (raw: Record<string, unknown>) => {
      const message = normalizeMessage(raw);
      if (message) handlers.onMessage(message);
    });

    this.hub.on('ConversationClosed', () => handlers.onClosed?.());

    this.hub.on('ConversationEscalated', (raw: Record<string, unknown>) => {
      handlers.onEscalated?.({
        queuePosition: Number(raw['queuePosition'] ?? 0),
      });
    });

    this.hub.on('ConversationAssigned', (raw: Record<string, unknown>) => {
      handlers.onAssigned?.({
        agentName: String(raw['agentName'] ?? 'Support Agent'),
      });
    });

    this.hub.on('ConversationInactivityWarning', (raw: Record<string, unknown>) => {
      handlers.onInactivityWarning?.({
        secondsUntilClose: Number(raw['secondsUntilClose'] ?? 0),
      });
    });

    this.hub.onreconnecting(() => handlers.onStateChange?.(false));
    this.hub.onreconnected(() => handlers.onStateChange?.(true));
    this.hub.onclose(() => handlers.onStateChange?.(false));

    await this.hub.start();
    handlers.onStateChange?.(true);
  }

  async ping(conversationId: string): Promise<void> {
    if (this.hub?.state === signalR.HubConnectionState.Connected) {
      await this.hub.invoke('Ping', conversationId);
    }
  }

  isConnected(): boolean {
    return this.hub?.state === signalR.HubConnectionState.Connected;
  }

  async disconnect(): Promise<void> {
    if (!this.hub) return;
    try {
      await this.hub.stop();
    } catch {
      // ignore teardown errors
    }
    this.hub = null;
    this.handlers?.onStateChange?.(false);
  }
}

function normalizeMessage(raw: Record<string, unknown>): RealtimeMessage | null {
  const id = String(raw['id'] ?? raw['Id'] ?? '');
  const content = String(raw['content'] ?? raw['Content'] ?? '');
  const sender = String(raw['sender'] ?? raw['Sender'] ?? 'bot');
  if (!id || !content) return null;
  return {
    id,
    content,
    sender,
    createdAt: String(raw['createdAt'] ?? raw['CreatedAt'] ?? ''),
    isAI: Boolean(raw['isAI'] ?? raw['IsAI'] ?? false),
  };
}
