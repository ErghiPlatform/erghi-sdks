import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ERGHI_CONFIG } from '../erghi.config';

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const config = inject(ERGHI_CONFIG);
  const token = authService.getToken();

  let headers = req.headers;
  
  if (token && !req.url.includes('/auth/')) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }
  
  if (config.workspaceId) {
    headers = headers.set('X-Workspace-Id', config.workspaceId);
  }
  
  if (config.accountId) {
    headers = headers.set('X-Account-Id', config.accountId);
  }

  if (headers !== req.headers) {
    const cloned = req.clone({ headers });
    return next(cloned);
  }

  return next(req);
};
