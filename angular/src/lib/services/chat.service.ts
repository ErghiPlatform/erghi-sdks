import { Injectable, Inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, defer, forkJoin, of, throwError } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { ERGHI_CONFIG, ErghiConfig } from '../erghi.config';
import { Attachment, Conversation, Message, Widget, PaginatedResponse, SecureContextOptions, SecureContextResult } from '../models';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  // Per-conversation credential the server issues on create; every visitor-side call (messages,
  // attachments, identity, secure context, the visitor hub) must present it as X-Visitor-Token.
  private readonly visitorTokens = new Map<string, string>();

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    @Inject(ERGHI_CONFIG) private config: ErghiConfig
  ) {}

  // Conversations
  getConversations(workspaceId: string, page = 1, limit = 20, status?: string): Observable<PaginatedResponse<Conversation>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    
    if (status) {
      params = params.set('status', status);
    }

    return this.http.get<PaginatedResponse<Conversation>>(
      `${this.config.apiUrl}/api/conversations`,
      { params }
    ).pipe(catchError(this.handleError));
  }

  getConversation(id: string): Observable<Conversation> {
    return this.http.get<Conversation>(`${this.config.apiUrl}/api/conversations/${id}`,
      { headers: this.visitorHeaders(id) })
      .pipe(catchError(this.handleError));
  }

  /** Remember a conversation's visitor token. createConversation does this for you; call it
   * when resuming a conversation whose id and token you persisted. */
  setVisitorToken(conversationId: string, visitorToken: string): void {
    this.visitorTokens.set(conversationId, visitorToken);
  }

  getVisitorToken(conversationId: string): string | undefined {
    return this.visitorTokens.get(conversationId);
  }

  clearVisitorToken(conversationId: string): void {
    this.visitorTokens.delete(conversationId);
  }

  /** identityToken: a JWT your backend signed with the workspace's widget secret; gives the
   * conversation a verified identity for integrations and action policies. */
  createConversation(widgetId: string, metadata?: Record<string, any>, identityToken?: string): Observable<Conversation> {
    const payload: any = { widgetId, metadata };
    const visitorId = this.authService.getVisitorId();
    if (visitorId) {
      payload.visitorId = visitorId;
    }
    if (identityToken) {
      payload.identityToken = identityToken;
    }
    return this.http.post<Conversation>(`${this.config.apiUrl}/api/conversations`, payload).pipe(
      tap(conversation => {
        if (conversation.visitorToken) {
          this.setVisitorToken(conversation.id, conversation.visitorToken);
        }
      }),
      catchError(this.handleError)
    );
  }

  /** Attach (or refresh) the signed identity JWT; a token for a different user is refused (409). */
  attachIdentityToken(conversationId: string, identityToken: string): Observable<void> {
    return this.withVisitorToken(conversationId, headers => this.http.post<void>(
      `${this.config.apiUrl}/api/conversations/${conversationId}/identity-token`,
      { identityToken },
      { headers }
    ));
  }

  /** Values only integrations can use (bound as {{secret.<key>}}); never shown to the AI.
   * Call again with fresh values whenever the user's token is renewed. */
  setSecureContext(
    conversationId: string,
    values: Record<string, string>,
    options: SecureContextOptions = {}
  ): Observable<SecureContextResult> {
    return this.withVisitorToken(conversationId, headers => this.http.put<SecureContextResult>(
      `${this.config.apiUrl}/api/conversations/${conversationId}/secure-context`,
      { values, ttlSeconds: options.ttlSeconds, merge: options.merge ?? true },
      { headers }
    ));
  }

  clearSecureContext(conversationId: string): Observable<void> {
    return this.withVisitorToken(conversationId, headers => this.http.delete<void>(
      `${this.config.apiUrl}/api/conversations/${conversationId}/secure-context`,
      { headers }
    ));
  }

  /** Operator-only (access token), not available to a visitor. */
  closeConversation(id: string): Observable<Conversation> {
    return this.http.post<Conversation>(`${this.config.apiUrl}/api/conversations/${id}/close`, {})
      .pipe(catchError(this.handleError));
  }

  assignConversation(id: string, agentId: string): Observable<Conversation> {
    return this.http.post<Conversation>(`${this.config.apiUrl}/api/conversations/${id}/assign`, {
      agentId
    }).pipe(catchError(this.handleError));
  }

  // Messages
  getMessages(conversationId: string, page = 1, limit = 50): Observable<PaginatedResponse<Message>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http.get<PaginatedResponse<Message>>(
      `${this.config.apiUrl}/api/conversations/${conversationId}/messages`,
      { params, headers: this.visitorHeaders(conversationId) }
    ).pipe(catchError(this.handleError));
  }

  /** Send a message. Files are uploaded first (images, PDF or plain text), then referenced. */
  sendMessage(
    conversationId: string,
    content: string,
    type: 'text' | 'image' | 'file' = 'text',
    files: Blob[] = []
  ): Observable<Message> {
    const uploads: Observable<Attachment[]> = files.length > 0
      ? forkJoin(files.map(file => this.uploadAttachment(conversationId, file)))
      : of([]);
    return uploads.pipe(
      switchMap(attachments => this.http.post<Message>(
        `${this.config.apiUrl}/api/conversations/${conversationId}/messages`,
        { content, type, attachments: attachments.length > 0 ? attachments : undefined },
        { headers: this.visitorHeaders(conversationId) }
      )),
      catchError(this.handleError)
    );
  }

  /** Upload one file to a conversation; the result goes in a message's attachments. */
  uploadAttachment(conversationId: string, file: Blob, filename?: string): Observable<Attachment> {
    const form = new FormData();
    form.append('file', file, filename ?? (file as File).name ?? 'attachment');
    return this.http.post<Attachment>(
      `${this.config.apiUrl}/api/conversations/${conversationId}/attachments`,
      form,
      { headers: this.visitorHeaders(conversationId) }
    ).pipe(catchError(this.handleError));
  }

  /**
   * Mark a single message as read. Matches ConversationController.cs's
   * `POST api/conversations/{conversationId}/messages/{messageId}/read` -- there is no bare
   * `/api/messages/{id}/read` route on the server, and this endpoint returns 204 No Content, not
   * a Message body (fixed 2026-08-25; the previous single-argument version called a route that
   * does not exist and expected a response body the real endpoint never sends).
   */
  markAsRead(conversationId: string, messageId: string): Observable<void> {
    return this.http.post<void>(
      `${this.config.apiUrl}/api/conversations/${conversationId}/messages/${messageId}/read`,
      {}
    ).pipe(catchError(this.handleError));
  }

  // Widgets
  getWidgets(workspaceId: string): Observable<Widget[]> {
    return this.http.get<Widget[]>(`${this.config.apiUrl}/api/widgets?workspaceId=${workspaceId}`)
      .pipe(catchError(this.handleError));
  }

  getWidget(id: string): Observable<Widget> {
    return this.http.get<Widget>(`${this.config.apiUrl}/api/widgets/${id}`)
      .pipe(catchError(this.handleError));
  }

  createWidget(workspaceId: string, name: string, slug: string, configuration?: any): Observable<Widget> {
    return this.http.post<Widget>(`${this.config.apiUrl}/api/widgets`, {
      workspaceId,
      name,
      slug,
      configuration
    }).pipe(catchError(this.handleError));
  }

  updateWidget(id: string, data: Partial<Widget>): Observable<Widget> {
    return this.http.put<Widget>(`${this.config.apiUrl}/api/widgets/${id}`, data)
      .pipe(catchError(this.handleError));
  }

  deleteWidget(id: string): Observable<void> {
    return this.http.delete<void>(`${this.config.apiUrl}/api/widgets/${id}`)
      .pipe(catchError(this.handleError));
  }

  /** X-Visitor-Token when this service holds one for the conversation; operators send none and
   * authenticate with their access token instead. */
  private visitorHeaders(conversationId: string): HttpHeaders {
    const token = this.visitorTokens.get(conversationId);
    return token ? new HttpHeaders({ 'X-Visitor-Token': token }) : new HttpHeaders();
  }

  /** For calls only the visitor's own client may make. */
  private withVisitorToken<T>(conversationId: string, call: (headers: HttpHeaders) => Observable<T>): Observable<T> {
    return defer(() => {
      if (!this.visitorTokens.has(conversationId)) {
        return throwError(() => new Error(
          'No visitor token for this conversation; create it with createConversation or call setVisitorToken'));
      }
      return call(this.visitorHeaders(conversationId));
    }).pipe(catchError(this.handleError));
  }

  private handleError(error: any): Observable<never> {
    console.error('Chat service error:', error);
    return throwError(() => error);
  }
}
