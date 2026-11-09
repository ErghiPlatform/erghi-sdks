import { Injectable, Inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ERGHI_CONFIG, ErghiConfig } from '../erghi.config';
import { InsightFilter, InsightPage, InsightPageParams, InsightSummary } from '../models';

/**
 * Conversation Insights: topic, sentiment and outcome of finished conversations.
 *
 * Needs the `view_insights` workspace permission (Owner and Admin roles), so call it with a
 * signed-in user's access token. API keys and client-credentials tokens get 403. An invalid
 * filter is a 400 with `code: 'invalid_filter'`.
 */
@Injectable({
  providedIn: 'root'
})
export class InsightsService {
  constructor(
    private http: HttpClient,
    @Inject(ERGHI_CONFIG) private config: ErghiConfig
  ) {}

  /** Counts by outcome, sentiment, category, topic (top 20) and language, plus the AI-resolved rate. */
  getSummary(filter: InsightFilter = {}): Observable<InsightSummary> {
    return this.http
      .get<InsightSummary>(`${this.config.apiUrl}/api/v1/insights/summary`, { params: this.toParams(filter) })
      .pipe(catchError(this.handleError));
  }

  /** Classified conversations, newest first. `pageSize` is capped at 100 by the server. */
  getConversations(filter: InsightFilter = {}, paging: InsightPageParams = {}): Observable<InsightPage> {
    let params = this.toParams(filter);
    if (paging.page !== undefined) params = params.set('page', String(paging.page));
    if (paging.pageSize !== undefined) params = params.set('pageSize', String(paging.pageSize));
    return this.http
      .get<InsightPage>(`${this.config.apiUrl}/api/v1/insights/conversations`, { params })
      .pipe(catchError(this.handleError));
  }

  /**
   * The same rows as CSV text (newest first, at most 10,000 rows). The server's file starts with
   * a UTF-8 byte-order mark so Excel reads Arabic correctly; the browser may strip it when
   * decoding, so prepend a BOM (U+FEFF) when saving a file for Excel. Text fields that start
   * with `= + - @` are prefixed with `'` so a spreadsheet will not run them as formulas.
   */
  exportCsv(filter: InsightFilter = {}): Observable<string> {
    return this.http
      .get(`${this.config.apiUrl}/api/v1/insights/export.csv`, { params: this.toParams(filter), responseType: 'text' })
      .pipe(catchError(this.handleError));
  }

  private toParams(filter: InsightFilter): HttpParams {
    let params = new HttpParams();
    const iso = (v: string | Date) => (v instanceof Date ? v.toISOString() : v);
    if (filter.from !== undefined) params = params.set('from', iso(filter.from));
    if (filter.to !== undefined) params = params.set('to', iso(filter.to));
    if (filter.channel) params = params.set('channel', filter.channel);
    if (filter.category) params = params.set('category', filter.category);
    if (filter.topic) params = params.set('topic', filter.topic);
    if (filter.sentiment) params = params.set('sentiment', filter.sentiment);
    if (filter.outcome) params = params.set('outcome', filter.outcome);
    if (filter.minConfidence !== undefined) params = params.set('minConfidence', String(filter.minConfidence));
    return params;
  }

  private handleError(error: any): Observable<never> {
    console.error('Insights service error:', error);
    return throwError(() => error);
  }
}
