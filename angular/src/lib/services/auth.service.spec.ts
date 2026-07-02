import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { ERGHI_CONFIG } from '../erghi.config';
import { AuthResponse, LoginRequest, RegisterRequest } from '../models';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  const mockConfig = { apiUrl: 'http://localhost:5000' };

  const mockAuthResponse: AuthResponse = {
    accessToken: 'mock-token',
    refreshToken: 'mock-refresh-token',
    user: {
      id: '123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'user',
      workspaceId: 'ws-123',
      createdAt: '2026-01-16T00:00:00Z'
    },
    expiresIn: 3600
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        { provide: ERGHI_CONFIG, useValue: mockConfig }
      ]
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('login', () => {
    it('should login successfully and store tokens', (done) => {
      const credentials: LoginRequest = {
        email: 'test@example.com',
        password: 'password123'
      };

      service.login(credentials).subscribe(response => {
        expect(response).toEqual(mockAuthResponse);
        expect(service.getToken()).toBe(mockAuthResponse.accessToken);
        expect(service.getRefreshToken()).toBe(mockAuthResponse.refreshToken);
        expect(service.currentUserValue).toEqual(mockAuthResponse.user);
        expect(service.isAuthenticated).toBe(true);
        done();
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/auth/login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(credentials);
      req.flush(mockAuthResponse);
    });

    it('should handle login error', (done) => {
      const credentials: LoginRequest = {
        email: 'test@example.com',
        password: 'wrong'
      };

      service.login(credentials).subscribe({
        next: () => fail('should have failed'),
        error: (error) => {
          expect(error.status).toBe(401);
          expect(service.isAuthenticated).toBe(false);
          done();
        }
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/auth/login`);
      req.flush({ message: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });
    });
  });

  describe('register', () => {
    it('should register successfully', (done) => {
      const registerData: RegisterRequest = {
        email: 'new@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User'
      };

      service.register(registerData).subscribe(response => {
        expect(response).toEqual(mockAuthResponse);
        expect(service.getToken()).toBeTruthy();
        done();
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/auth/register`);
      expect(req.request.method).toBe('POST');
      req.flush(mockAuthResponse);
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', (done) => {
      localStorage.setItem('erghi_refresh_token', 'old-refresh-token');

      const newAuthResponse = { ...mockAuthResponse, accessToken: 'new-token' };

      service.refreshToken().subscribe(response => {
        expect(response.accessToken).toBe('new-token');
        expect(service.getToken()).toBe('new-token');
        done();
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/auth/refresh`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ refreshToken: 'old-refresh-token' });
      req.flush(newAuthResponse);
    });

    it('should fail if no refresh token exists', async () => {
      service.refreshToken().subscribe({
        error: (error) => {
          expect(error.message).toContain('No refresh token');
        }
      });
    });
  });

  describe('logout', () => {
    it('should logout and clear tokens', (done) => {
      localStorage.setItem('erghi_token', 'token');
      localStorage.setItem('erghi_refresh_token', 'refresh');
      localStorage.setItem('erghi_user', JSON.stringify(mockAuthResponse.user));

      service.logout().subscribe(() => {
        expect(service.getToken()).toBeNull();
        expect(service.getRefreshToken()).toBeNull();
        expect(service.currentUserValue).toBeNull();
        expect(service.isAuthenticated).toBe(false);
        done();
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/auth/logout`);
      req.flush({});
    });

    it('should clear tokens even if logout API fails', (done) => {
      localStorage.setItem('erghi_token', 'token');

      service.logout().subscribe({
        error: () => {
          expect(service.getToken()).toBeNull();
          done();
        }
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/auth/logout`);
      req.flush({}, { status: 500, statusText: 'Server Error' });
    });
  });

  describe('me', () => {
    it('should fetch current user', (done) => {
      service.me().subscribe(user => {
        expect(user).toEqual(mockAuthResponse.user);
        expect(service.currentUserValue).toEqual(user);
        done();
      });

      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/auth/me`);
      req.flush(mockAuthResponse.user);
    });
  });

  describe('currentUser$', () => {
    it('should emit user changes', (done) => {
      const users: any[] = [];
      
      service.currentUser$.subscribe(user => {
        users.push(user);
        
        if (users.length === 2) {
          expect(users[0]).toBeNull();
          expect(users[1]).toEqual(mockAuthResponse.user);
          done();
        }
      });

      service.login({ email: 'test@test.com', password: 'pass' }).subscribe();
      
      const req = httpMock.expectOne(`${mockConfig.apiUrl}/api/auth/login`);
      req.flush(mockAuthResponse);
    });
  });
});
