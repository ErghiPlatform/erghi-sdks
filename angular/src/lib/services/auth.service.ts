import { Injectable, Inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';
import { ERGHI_CONFIG, ErghiConfig } from '../erghi.config';
import { AuthResponse, LoginRequest, RegisterRequest, User } from '../models';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly TOKEN_KEY = 'erghi_token';
  private readonly REFRESH_TOKEN_KEY = 'erghi_refresh_token';
  private readonly USER_KEY = 'erghi_user';
  
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
    return this.http.post<AuthResponse>(`${this.config.apiUrl}/api/auth/login`, credentials)
      .pipe(
        tap(response => this.handleAuthResponse(response)),
        catchError(this.handleError)
      );
  }

  register(data: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.config.apiUrl}/api/auth/register`, data)
      .pipe(
        tap(response => this.handleAuthResponse(response)),
        catchError(this.handleError)
      );
  }

  refreshToken(): Observable<AuthResponse> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }

    return this.http.post<AuthResponse>(`${this.config.apiUrl}/api/auth/refresh`, { refreshToken })
      .pipe(
        tap(response => this.handleAuthResponse(response)),
        catchError(this.handleError)
      );
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
    return this.http.get<User>(`${this.config.apiUrl}/api/auth/me`)
      .pipe(
        tap(user => {
          localStorage.setItem(this.USER_KEY, JSON.stringify(user));
          this.currentUserSubject.next(user);
        }),
        catchError(this.handleError)
      );
  }

  private handleAuthResponse(response: AuthResponse): void {
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
