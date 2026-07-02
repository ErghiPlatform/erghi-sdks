import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ChatService } from './chat.service';
import { ERGHI_CONFIG } from '../erghi.config';
import { Conversation, Message, Widget, PaginatedResponse } from '../models';

describe('ChatService', () => {
  let service: ChatService;
  let httpMock: HttpTestingController;
  const mockConfig = { apiUrl: 'http://localhost:5000' };

  const mockConversation: Conversation = {
    id: 'conv-123',
    workspaceId: 'ws-123',
    widgetId: 'widget-123',
    status: 'open',
    createdAt: '2026-01-16T00:00:00Z'
  };

  const mockMessage: Message = {
    id: 'msg-123',
    conversationId: 'conv-123',
    content: 'Hello',
    sender: 'visitor',
    type: 'text',
    createdAt: '2026-01-16T00:00:00Z',
    isRead: false
  };

  const mockWidget: Widget = {
    id: 'widget-123',
    workspaceId: 'ws-123',
    name: 'Test Widget',
    slug: 'test-widget',
    isActive: true,
    configuration: {},
    createdAt: '2026-01-16T00:00:00Z'
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ChatService,
        { provide: ERGHI_CONFIG, useValue: mockConfig }
      ]
    });
    service = TestBed.inject(ChatService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Conversations', () => {
    it('should get conversations with pagination', (done) => {
      const mockResponse: PaginatedResponse<Conversation> = {
        data: [mockConversation],
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1
      };

      service.getConversations('ws-123', 1, 20).subscribe(response => {
        expect(response).toEqual(mockResponse);
        expect(response.data.length).toBe(1);
        done();
      });

      const req = httpMock.expectOne(r => r.url.includes('/api/conversations'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('page')).toBe('1');
      expect(req.request.params.get('limit')).toBe('20');
      req.flush(mockResponse);
    });

    it('should get conversation by id', (done) => {
      service.getConversation('conv-123').subscribe(conv => {
        expect(conv).toEqual(mockConversation);
        done();
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/conversations/conv-123`);
      req.flush(mockConversation);
    });

    it('should create conversation', (done) => {
      service.createConversation('widget-123', { page: '/test' }).subscribe(conv => {
        expect(conv).toEqual(mockConversation);
        done();
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/conversations`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ widgetId: 'widget-123', metadata: { page: '/test' } });
      req.flush(mockConversation);
    });

    it('should close conversation', (done) => {
      const closedConv = { ...mockConversation, status: 'closed' as const };

      service.closeConversation('conv-123').subscribe(conv => {
        expect(conv.status).toBe('closed');
        done();
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/conversations/conv-123/close`);
      expect(req.request.method).toBe('POST');
      req.flush(closedConv);
    });

    it('should assign conversation', (done) => {
      const assignedConv = { ...mockConversation, assignedAgentId: 'agent-123', status: 'assigned' as const };

      service.assignConversation('conv-123', 'agent-123').subscribe(conv => {
        expect(conv.assignedAgentId).toBe('agent-123');
        done();
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/conversations/conv-123/assign`);
      req.flush(assignedConv);
    });
  });

  describe('Messages', () => {
    it('should get messages with pagination', (done) => {
      const mockResponse: PaginatedResponse<Message> = {
        data: [mockMessage],
        page: 1,
        limit: 50,
        total: 1,
        totalPages: 1
      };

      service.getMessages('conv-123', 1, 50).subscribe(response => {
        expect(response.data.length).toBe(1);
        done();
      });

      const req = httpMock.expectOne(r => r.url.includes('/messages'));
      req.flush(mockResponse);
    });

    it('should send message', (done) => {
      service.sendMessage('conv-123', 'Hello', 'text').subscribe(msg => {
        expect(msg).toEqual(mockMessage);
        done();
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/conversations/conv-123/messages`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ content: 'Hello', type: 'text' });
      req.flush(mockMessage);
    });

    it('should mark message as read', (done) => {
      const readMessage = { ...mockMessage, isRead: true };

      service.markAsRead('msg-123').subscribe(msg => {
        expect(msg.isRead).toBe(true);
        done();
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/messages/msg-123/read`);
      req.flush(readMessage);
    });

    it('should delete message', (done) => {
      service.deleteMessage('msg-123').subscribe(() => {
        done();
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/messages/msg-123`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('Widgets', () => {
    it('should get widgets', (done) => {
      service.getWidgets('ws-123').subscribe(widgets => {
        expect(widgets.length).toBe(1);
        expect(widgets[0]).toEqual(mockWidget);
        done();
      });

      const req = httpMock.expectOne(r => r.url.includes('/api/widgets'));
      req.flush([mockWidget]);
    });

    it('should get widget by id', (done) => {
      service.getWidget('widget-123').subscribe(widget => {
        expect(widget).toEqual(mockWidget);
        done();
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/widgets/widget-123`);
      req.flush(mockWidget);
    });

    it('should create widget', (done) => {
      service.createWidget('ws-123', 'New Widget', 'new-widget').subscribe(widget => {
        expect(widget).toEqual(mockWidget);
        done();
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/widgets`);
      expect(req.request.method).toBe('POST');
      req.flush(mockWidget);
    });

    it('should update widget', (done) => {
      const updated = { ...mockWidget, name: 'Updated' };

      service.updateWidget('widget-123', { name: 'Updated' }).subscribe(widget => {
        expect(widget.name).toBe('Updated');
        done();
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/widgets/widget-123`);
      expect(req.request.method).toBe('PUT');
      req.flush(updated);
    });

    it('should delete widget', (done) => {
      service.deleteWidget('widget-123').subscribe(() => {
        done();
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/widgets/widget-123`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });
});
