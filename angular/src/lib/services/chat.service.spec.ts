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

    it('should mark message as read against the real conversation-scoped route', (done) => {
      // Regression guard 2026-08-25: the previous implementation called a bare
      // /api/messages/{id}/read route that has never existed on the server (real route is
      // conversation-scoped, ConversationController.cs:547) and expected a Message body back
      // from an endpoint that actually returns 204 No Content.
      service.markAsRead('conv-123', 'msg-123').subscribe(() => {
        done();
      });

      const req = httpMock.expectOne(
        `${mockConfig.apiUrl}/api/conversations/conv-123/messages/msg-123/read`
      );
      expect(req.request.method).toBe('POST');
      req.flush(null);
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

  describe('Visitor calls', () => {
    const base = `${mockConfig.apiUrl}/api/conversations/conv-123`;

    it('remembers the visitor token from create and sends the identity token', () => {
      service.createConversation('widget-123', undefined, 'jwt').subscribe(c => {
        expect(c.visitorToken).toBe('vt-1');
      });
      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/conversations`);
      expect(req.request.body.identityToken).toBe('jwt');
      req.flush({ ...mockConversation, visitorToken: 'vt-1' });
      expect(service.getVisitorToken('conv-123')).toBe('vt-1');
    });

    it('attaches an identity token with the stored visitor token', () => {
      service.setVisitorToken('conv-123', 'vt-1');
      service.attachIdentityToken('conv-123', 'jwt').subscribe();
      const req = httpMock.expectOne(`${base}/identity-token`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('X-Visitor-Token')).toBe('vt-1');
      expect(req.request.body).toEqual({ identityToken: 'jwt' });
      req.flush(null);
    });

    it('puts secure context merging by default, and clears it', () => {
      service.setVisitorToken('conv-123', 'vt-1');
      service.setSecureContext('conv-123', { mf_access_token: 'abc' }, { ttlSeconds: 900 })
        .subscribe(r => expect(r.keys).toEqual(['mf_access_token']));
      const put = httpMock.expectOne(`${base}/secure-context`);
      expect(put.request.method).toBe('PUT');
      expect(put.request.headers.get('X-Visitor-Token')).toBe('vt-1');
      expect(put.request.body).toEqual({ values: { mf_access_token: 'abc' }, ttlSeconds: 900, merge: true });
      put.flush({ expiresAt: '2026-10-05T10:00:00Z', keys: ['mf_access_token'] });

      service.clearSecureContext('conv-123').subscribe();
      const del = httpMock.expectOne(`${base}/secure-context`);
      expect(del.request.method).toBe('DELETE');
      expect(del.request.headers.get('X-Visitor-Token')).toBe('vt-1');
      del.flush(null);
    });

    it('refuses secure context without a visitor token and makes no request', (done) => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      service.setSecureContext('conv-123', { a: 'b' }).subscribe({
        error: (err: Error) => {
          expect(err.message).toContain('No visitor token');
          done();
        }
      });
      httpMock.expectNone(`${base}/secure-context`);
    });

    it('sends and reads messages with the visitor token', () => {
      service.setVisitorToken('conv-123', 'vt-1');
      service.sendMessage('conv-123', 'Hello').subscribe();
      const post = httpMock.expectOne(`${base}/messages`);
      expect(post.request.headers.get('X-Visitor-Token')).toBe('vt-1');
      expect(post.request.body).toEqual({ content: 'Hello', type: 'text', attachments: undefined });
      post.flush(mockMessage);

      service.getMessages('conv-123').subscribe();
      const get = httpMock.expectOne(r => r.url === `${base}/messages`);
      expect(get.request.headers.get('X-Visitor-Token')).toBe('vt-1');
      get.flush({ data: [], total: 0, page: 1, limit: 50, totalPages: 0 });
    });

    it('uploads files first, then references them in the message', () => {
      service.setVisitorToken('conv-123', 'vt-1');
      const uploaded = { id: 'a-1', filename: 'r.pdf', contentType: 'application/pdf', size: 3, url: 'https://x/a-1' };
      service.sendMessage('conv-123', 'see file', 'text', [new Blob(['abc'], { type: 'application/pdf' })]).subscribe();

      const upload = httpMock.expectOne(`${base}/attachments`);
      expect(upload.request.body instanceof FormData).toBe(true);
      expect(upload.request.headers.get('X-Visitor-Token')).toBe('vt-1');
      upload.flush(uploaded);

      const post = httpMock.expectOne(`${base}/messages`);
      expect(post.request.body).toEqual({ content: 'see file', type: 'text', attachments: [uploaded] });
      post.flush(mockMessage);
    });
  });
});
