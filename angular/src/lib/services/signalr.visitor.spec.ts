import { TestBed } from '@angular/core/testing';
import { SignalRService, SignalREvent } from './signalr.service';
import { AuthService } from './auth.service';
import { ChatService } from './chat.service';
import { ERGHI_CONFIG } from '../erghi.config';

const handlers = new Map<string, (data?: unknown) => void>();
const hub = {
  state: 'Disconnected',
  on: jest.fn((event: string, cb: (data?: unknown) => void) => handlers.set(event, cb)),
  onreconnecting: jest.fn(),
  onreconnected: jest.fn(),
  onclose: jest.fn(),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
};
const withUrl = jest.fn();

jest.mock('@microsoft/signalr', () => {
  const builder = {
    withUrl: (...args: unknown[]) => { withUrl(...args); return builder; },
    withAutomaticReconnect: () => builder,
    configureLogging: () => builder,
    build: () => hub,
  };
  return {
    HubConnectionBuilder: jest.fn(() => builder),
    HubConnectionState: { Disconnected: 'Disconnected', Connected: 'Connected', Reconnecting: 'Reconnecting' },
    LogLevel: { Information: 2, Warning: 3 },
  };
});

describe('SignalRService visitor hub', () => {
  let service: SignalRService;
  const getVisitorToken = jest.fn();

  beforeEach(() => {
    handlers.clear();
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        SignalRService,
        { provide: AuthService, useValue: { getToken: jest.fn() } },
        { provide: ChatService, useValue: { getVisitorToken } },
        { provide: ERGHI_CONFIG, useValue: { apiUrl: 'https://api.example.test/' } },
      ],
    });
    service = TestBed.inject(SignalRService);
  });

  it('connects with the visitor token in the query and no credentials', async () => {
    getVisitorToken.mockReturnValue('vt/1');
    await service.connectVisitor('conv 1');
    expect(withUrl).toHaveBeenCalledWith(
      'https://api.example.test/hubs/visitor?conversationId=conv%201&visitorToken=vt%2F1',
      { withCredentials: false }
    );
    expect(hub.start).toHaveBeenCalled();
  });

  it('maps server events, including MessageReceived and ContextRequired', async () => {
    getVisitorToken.mockReturnValue('vt-1');
    const events: SignalREvent[] = [];
    service.events$.subscribe(e => events.push(e));
    await service.connectVisitor('conv-1');

    handlers.get('MessageReceived')!({ id: 'm-1' });
    handlers.get('ContextRequired')!();
    expect(events).toEqual([
      { type: 'message', data: { id: 'm-1' } },
      { type: 'context-required', data: { conversationId: 'conv-1' } },
    ]);
  });

  it('refuses without a visitor token', async () => {
    getVisitorToken.mockReturnValue(undefined);
    await expect(service.connectVisitor('conv-1')).rejects.toThrow('No visitor token');
    expect(withUrl).not.toHaveBeenCalled();
  });
});
