import { Injectable, Inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ERGHI_CONFIG, ErghiConfig } from '../erghi.config';
import { Conversation, Message, Widget, PaginatedResponse } from '../models';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  constructor(
    private http: HttpClient,
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
    return this.http.get<Conversation>(`${this.config.apiUrl}/api/conversations/${id}`)
      .pipe(catchError(this.handleError));
  }

  createConversation(widgetId: string, metadata?: Record<string, any>): Observable<Conversation> {
    return this.http.post<Conversation>(`${this.config.apiUrl}/api/conversations`, {
      widgetId,
      metadata
    }).pipe(catchError(this.handleError));
  }

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
      { params }
    ).pipe(catchError(this.handleError));
  }

  sendMessage(conversationId: string, content: string, type: 'text' | 'image' | 'file' = 'text'): Observable<Message> {
    return this.http.post<Message>(
      `${this.config.apiUrl}/api/conversations/${conversationId}/messages`,
      { content, type }
    ).pipe(catchError(this.handleError));
  }

  markAsRead(messageId: string): Observable<Message> {
    return this.http.post<Message>(`${this.config.apiUrl}/api/messages/${messageId}/read`, {})
      .pipe(catchError(this.handleError));
  }

  deleteMessage(messageId: string): Observable<void> {
    return this.http.delete<void>(`${this.config.apiUrl}/api/messages/${messageId}`)
      .pipe(catchError(this.handleError));
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

  private handleError(error: any): Observable<never> {
    console.error('Chat service error:', error);
    return throwError(() => error);
  }
}
