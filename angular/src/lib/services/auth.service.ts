import { Injectable, Inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';
import { ERGHI_CONFIG, ErghiConfig } from '../erghi.config';
import { AuthResponse, LoginRequest, RegisterRequest, User } from '../models';

/**
 * Raw shapes of the platform's GoTrue auth server. The gateway forwards
 * `/api/auth/*` to it unchanged, so responses are snake_case and are mapped
 * onto the SDK's camelCase models here.
 */
interface GoTrueUser {
  id: string;
  email?: string;
  role?: string;
  created_at?: string;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
}

interface GoTrueSession {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: GoTrueUser;
}

function text(source: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' ? value : undefined;
}

export function toUser(user: GoTrueUser): User {
  return {
    id: user.id,
    email: user.email ?? '',
    firstName: text(user.user_metadata, 'first_name') ?? '',
    lastName: text(user.user_metadata, 'last_name') ?? '',
    role: text(user.app_metadata, 'role') ?? user.role ?? 'authenticated',
    workspaceId: text(user.app_metadata, 'workspace_id') ?? '',
    createdAt: user.created_at ?? '',
  };
}

/** `/signup` returns a bare user while email confirmation is pending: tokens are then empty. */
export function toAuthResponse(body: GoTrueSession | GoTrueUser): AuthResponse {
  const session = body as GoTrueSession;
  return {
    accessToken: session.access_token ?? '',
    refreshToken: session.refresh_token ?? '',
    expiresIn: session.expires_in ?? 0,
    user: toUser(session.user ?? (body as GoTrueUser)),
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly TOKEN_KEY = 'erghi_token';
  private readonly REFRESH_TOKEN_KEY = 'erghi_refresh_token';
  private readonly USER_KEY = 'erghi_user';
  private visitorId: string | null = null;
  
  private currentUserSubject = new BehaviorSubject<User | null>(this.getUserFromStorage());
  public currentUser$ = this.currentUserSubject.asObservable();
  
  constructor(
    private http: HttpClient,
    @Inject(ERGHI_CONFIG) private config: ErghiConfig
  ) {}

  private getUserFromStorage(): User | null {
    const userJson = localStorage.getItem(this.USER_KEY);
    return userJson ? JSON.parse(userJson) : null;
  }

  get currentUserValue(): User | null {
    return this.currentUserSubject.value;
  }

  get isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<GoTrueSession>(`${this.config.apiUrl}/api/auth/login`, {
      email: credentials.email,
      password: credentials.password
    })
      .pipe(
        map(toAuthResponse),
        tap(response => this.handleAuthResponse(response)),
        catchError(this.handleError)
      );
  }

  register(data: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<GoTrueSession | GoTrueUser>(`${this.config.apiUrl}/api/auth/register`, {
      email: data.email,
      password: data.password,
      data: { first_name: data.firstName, last_name: data.lastName }
    })
      .pipe(
        map(toAuthResponse),
        tap(response => this.handleAuthResponse(response)),
        catchError(this.handleError)
      );
  }

  refreshToken(): Observable<AuthResponse> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }

    return this.http.post<GoTrueSession>(
      `${this.config.apiUrl}/api/auth/token`,
      { refresh_token: refreshToken },
      { params: { grant_type: 'refresh_token' } }
    )
      .pipe(
        map(toAuthResponse),
        tap(response => this.handleAuthResponse(response)),
        catchError(this.handleError)
      );
  }

  authenticateVisitor(widgetId: string, jwtToken: string): Observable<string> {
    return this.http.post<any>(`${this.config.apiUrl}/api/conversations/identity`, {
      widgetId,
      jwtToken
    }).pipe(
      map(response => {
        this.visitorId = response.visitorId || response.VisitorId;
        if (!this.visitorId) {
          throw new Error('Visitor ID not found in identity response');
        }
        return this.visitorId;
      }),
      catchError(this.handleError)
    );
  }

  getVisitorId(): string | null {
    return this.visitorId;
  }

  logout(): Observable<void> {
    const token = this.getToken();
    if (!token) {
      this.clearAuthData();
      return new Observable(observer => {
        observer.next();
        observer.complete();
      });
    }

    return this.http.post<void>(`${this.config.apiUrl}/api/auth/logout`, {})
      .pipe(
        tap(() => this.clearAuthData()),
        catchError(error => {
          this.clearAuthData();
          return throwError(() => error);
        })
      );
  }

  me(): Observable<User> {
    return this.http.get<GoTrueUser>(`${this.config.apiUrl}/api/auth/user`)
      .pipe(
        map(toUser),
        tap(user => {
          localStorage.setItem(this.USER_KEY, JSON.stringify(user));
          this.currentUserSubject.next(user);
        }),
        catchError(this.handleError)
      );
  }

  private handleAuthResponse(response: AuthResponse): void {
    if (!response.accessToken) {
      // Signup pending email confirmation: no session yet.
      return;
    }
    localStorage.setItem(this.TOKEN_KEY, response.accessToken);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, response.refreshToken);
    localStorage.setItem(this.USER_KEY, JSON.stringify(response.user));
    this.currentUserSubject.next(response.user);
  }

  private clearAuthData(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.currentUserSubject.next(null);
  }

  private handleError(error: any): Observable<never> {
    console.error('Auth error:', error);
    return throwError(() => error);
  }
}
