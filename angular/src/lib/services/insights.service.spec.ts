import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { InsightsService } from './insights.service';
import { ERGHI_CONFIG } from '../erghi.config';

describe('InsightsService', () => {
  let service: InsightsService;
  let httpMock: HttpTestingController;
  const base = 'http://localhost:5000';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [InsightsService, { provide: ERGHI_CONFIG, useValue: { apiUrl: base } }]
    });
    service = TestBed.inject(InsightsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('gets the summary with only the filters that are set', () => {
    let result: any;
    service.getSummary({ from: new Date('2026-11-01T00:00:00Z'), outcome: 'resolved_by_ai', topic: '' })
      .subscribe(r => (result = r));
    const req = httpMock.expectOne(r => r.url === `${base}/api/v1/insights/summary`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('from')).toBe('2026-11-01T00:00:00.000Z');
    expect(req.request.params.get('outcome')).toBe('resolved_by_ai');
    expect(req.request.params.has('topic')).toBe(false);
    req.flush({ total: 1, aiResolvedRate: 1, outcomes: [], sentiments: [], categories: [], topics: [], languages: [] });
    expect(result.aiResolvedRate).toBe(1);
  });

  it('lists conversations with paging', () => {
    service.getConversations({ channel: 'widget', minConfidence: 0.5 }, { page: 2, pageSize: 50 }).subscribe();
    const req = httpMock.expectOne(r => r.url === `${base}/api/v1/insights/conversations`);
    expect(req.request.params.get('channel')).toBe('widget');
    expect(req.request.params.get('minConfidence')).toBe('0.5');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('50');
    req.flush({ total: 0, page: 2, pageSize: 50, items: [] });
  });

  it('exports CSV as text', () => {
    let csv = '';
    service.exportCsv({ to: '2026-12-01T00:00:00Z' }).subscribe(r => (csv = r));
    const req = httpMock.expectOne(r => r.url === `${base}/api/v1/insights/export.csv`);
    expect(req.request.responseType).toBe('text');
    expect(req.request.params.get('to')).toBe('2026-12-01T00:00:00Z');
    req.flush('﻿conversation_id\r\n');
    expect(csv).toBe('﻿conversation_id\r\n');
  });
});
