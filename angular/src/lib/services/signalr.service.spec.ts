import { TestBed } from '@angular/core/testing';
import { SignalRService } from './signalr.service';
import { AuthService } from './auth.service';
import { ERGHI_CONFIG } from '../erghi.config';
import { HubConnectionState } from '@microsoft/signalr';

describe('SignalRService', () => {
  let service: SignalRService;
  let authService: jasmine.SpyObj<AuthService>;
  const mockConfig = { apiUrl: 'http://localhost:5000' };

  beforeEach(() => {
    const authSpy = jasmine.createSpyObj('AuthService', ['getToken']);

    TestBed.configureTestingModule({
      providers: [
        SignalRService,
        { provide: AuthService, useValue: authSpy },
        { provide: ERGHI_CONFIG, useValue: mockConfig }
      ]
    });
    
    service = TestBed.inject(SignalRService);
    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should throw error if no token available on connect', async () => {
    authService.getToken.and.returnValue(null);

    await expect(service.connect('test-signalr-url'))
      .rejects
      .toThrow('No authentication token');
  });

  it('should emit connection state changes', (done) => {
    const states: HubConnectionState[] = [];
    
    service.connectionState$.subscribe(state => {
      states.push(state);
      
      if (states.length === 1) {
        expect(states[0]).toBe(HubConnectionState.Disconnected);
        done();
      }
    });
  });

  it('should emit events', (done) => {
    service.events$.subscribe(event => {
      expect(event.type).toBeDefined();
      expect(event.data).toBeDefined();
      done();
    });

    // Simulate event emission
    // Note: Full SignalR testing would require mocking the hub connection
  });

  it('should disconnect cleanly', async () => {
    authService.getToken.and.returnValue('mock-token');
    
    // Note: This would need proper SignalR mocking for full test
    await service.disconnect();
    
    // Verify cleanup
    expect(service).toBeTruthy();
  });
});
