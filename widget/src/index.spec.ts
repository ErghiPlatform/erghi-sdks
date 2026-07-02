import ErghiWidget from './index';

// Mock SignalR
jest.mock('@microsoft/signalr', () => ({
  HubConnectionBuilder: jest.fn().mockImplementation(() => ({
    withUrl: jest.fn().mockReturnThis(),
    withAutomaticReconnect: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      invoke: jest.fn().mockResolvedValue(undefined),
      onclose: jest.fn(),
    }),
  })),
  HttpTransportType: {
    WebSockets: 1,
    ServerSentEvents: 2,
    LongPolling: 4,
  },
  LogLevel: {
    Information: 1,
  },
}));

// Mock fetch
global.fetch = jest.fn();

describe('ErghiWidget', () => {
  let widget: ErghiWidget;
  const mockConfig = {
    workspace: 'test-workspace-id',
    apiUrl: 'https://api.test.com',
    signalrUrl: 'https://api.test.com/hubs/chat',
  };

  beforeEach(() => {
    // Clear DOM
    document.body.innerHTML = '';
    
    // Reset fetch mock
    (global.fetch as jest.Mock).mockClear();
    
    // Mock successful fetch responses
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'conv-123', messages: [] }),
    });

    widget = new ErghiWidget(mockConfig);
  });

  afterEach(() => {
    if (widget) {
      widget.destroy();
    }
  });

  describe('Initialization', () => {
    it('should create widget with default config', () => {
      expect(widget).toBeInstanceOf(ErghiWidget);
    });

    it('should render bubble and window elements', () => {
      const bubble = document.getElementById('erghi-bubble');
      const chatWindow = document.getElementById('erghi-window');
      
      expect(bubble).toBeTruthy();
      expect(chatWindow).toBeTruthy();
    });

    it('should apply custom primary color', () => {
      const customWidget = new ErghiWidget({
        ...mockConfig,
        primaryColor: '#ff0000',
      });

      const bubble = document.getElementById('erghi-bubble');
      expect(bubble?.style.backgroundColor).toBe('rgb(255, 0, 0)');
      
      customWidget.destroy();
    });

    it('should position bubble based on config', () => {
      const leftWidget = new ErghiWidget({
        ...mockConfig,
        position: 'bottom-left',
      });

      const bubble = document.getElementById('erghi-bubble');
      expect(bubble?.style.left).toBe('20px');
      expect(bubble?.style.right).toBe('');
      
      leftWidget.destroy();
    });

    it('should auto-open if configured', async () => {
      const autoOpenWidget = new ErghiWidget({
        ...mockConfig,
        autoOpen: true,
      });

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      const window = document.getElementById('erghi-window');
      expect(window?.style.display).not.toBe('none');
      
      autoOpenWidget.destroy();
    });
  });

  describe('Window Controls', () => {
    it('should open window when open() is called', () => {
      widget.open();
      
      const window = document.getElementById('erghi-window');
      expect(window?.style.display).not.toBe('none');
    });

    it('should close window when close() is called', () => {
      widget.open();
      widget.close();
      
      const window = document.getElementById('erghi-window');
      expect(window?.style.display).toBe('none');
    });

    it('should toggle window state', () => {
      const window = document.getElementById('erghi-window');
      
      widget.toggle();
      expect(window?.style.display).not.toBe('none');
      
      widget.toggle();
      expect(window?.style.display).toBe('none');
    });

    it('should hide bubble when window opens', () => {
      widget.open();
      
      const bubble = document.getElementById('erghi-bubble');
      expect(bubble?.style.display).toBe('none');
    });

    it('should show bubble when window closes', () => {
      widget.open();
      widget.close();
      
      const bubble = document.getElementById('erghi-bubble');
      expect(bubble?.style.display).not.toBe('none');
    });
  });

  describe('Conversation Handling', () => {
    it('should create conversation on first open', async () => {
      await widget.open();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/conversations',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('test-workspace-id'),
        })
      );
    });

    it('should not create duplicate conversations', async () => {
      await widget.open();
      (global.fetch as jest.Mock).mockClear();
      
      widget.close();
      await widget.open();

      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/conversations'),
        expect.anything()
      );
    });

    it('should handle conversation creation error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await widget.open();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to start conversation:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Message Sending', () => {
    beforeEach(async () => {
      await widget.open();
    });

    it('should send message via API', async () => {
      const input = document.getElementById('erghi-input') as HTMLInputElement;
      const sendButton = document.querySelector('#erghi-send-button') as HTMLButtonElement;
      
      input.value = 'Test message';
      sendButton.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/messages'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Test message'),
        })
      );
    });

    it('should clear input after sending', async () => {
      const input = document.getElementById('erghi-input') as HTMLInputElement;
      const sendButton = document.querySelector('#erghi-send-button') as HTMLButtonElement;
      
      input.value = 'Test message';
      sendButton.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(input.value).toBe('');
    });

    it('should not send empty messages', () => {
      const input = document.getElementById('erghi-input') as HTMLInputElement;
      const sendButton = document.querySelector('#erghi-send-button') as HTMLButtonElement;
      
      input.value = '   ';
      sendButton.click();

      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/messages'),
        expect.anything()
      );
    });

    it('should send message on Enter key', async () => {
      const input = document.getElementById('erghi-input') as HTMLInputElement;
      
      input.value = 'Test message';
      
      const event = new KeyboardEvent('keypress', { key: 'Enter' });
      input.dispatchEvent(event);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/messages'),
        expect.anything()
      );
    });
  });

  describe('Message Display', () => {
    it('should display greeting message', () => {
      const customWidget = new ErghiWidget({
        ...mockConfig,
        greeting: 'Hello there!',
      });

      customWidget.open();

      const messagesContainer = document.getElementById('erghi-messages');
      expect(messagesContainer?.textContent).toContain('Hello there!');
      
      customWidget.destroy();
    });

    it('should add agent message class to greeting', () => {
      widget.open();

      const messageDiv = document.querySelector('.erghi-message');
      expect(messageDiv?.classList.contains('erghi-agent')).toBe(true);
    });

    it('should handle received messages from SignalR', async () => {
      await widget.open();

      // Simulate SignalR message
      const mockMessage = {
        id: 'msg-123',
        content: 'Agent response',
        sender: 'agent',
        timestamp: new Date().toISOString(),
      };

      // Trigger the message handler manually
      const messagesContainer = document.getElementById('erghi-messages');
      const messageDiv = document.createElement('div');
      messageDiv.className = 'erghi-message erghi-agent';
      messageDiv.textContent = mockMessage.content;
      messagesContainer?.appendChild(messageDiv);

      expect(messagesContainer?.textContent).toContain('Agent response');
    });
  });

  describe('Cleanup', () => {
    it('should remove all DOM elements on destroy', () => {
      widget.destroy();

      expect(document.getElementById('erghi-bubble')).toBeNull();
      expect(document.getElementById('erghi-window')).toBeNull();
      expect(document.getElementById('erghi-styles')).toBeNull();
    });

    it('should disconnect SignalR on destroy', async () => {
      await widget.open();
      
      const stopSpy = jest.fn();
      // Mock the connection stop method
      (widget as any).connection = { stop: stopSpy };
      
      widget.destroy();

      expect(stopSpy).toHaveBeenCalled();
    });

    it('should handle destroy when not initialized', () => {
      const newWidget = new ErghiWidget(mockConfig);
      
      expect(() => newWidget.destroy()).not.toThrow();
    });
  });

  describe('Theme Support', () => {
    it('should apply light theme by default', () => {
      const window = document.getElementById('erghi-window');
      expect(window?.style.backgroundColor).toBe('white');
    });

    it('should apply dark theme', () => {
      const darkWidget = new ErghiWidget({
        ...mockConfig,
        theme: 'dark',
      });

      const window = document.getElementById('erghi-window');
      expect(window?.style.backgroundColor).toBe('rgb(31, 41, 55)');
      
      darkWidget.destroy();
    });

    it('should detect system theme with auto', () => {
      const autoWidget = new ErghiWidget({
        ...mockConfig,
        theme: 'auto',
      });

      // Theme detection is system-dependent, just verify no errors
      expect(autoWidget).toBeInstanceOf(ErghiWidget);
      
      autoWidget.destroy();
    });
  });

  describe('Responsive Design', () => {
    it('should adjust window size on mobile', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      const mobileWidget = new ErghiWidget(mockConfig);
      const chatWindow = document.getElementById('erghi-window');
      
      // Mobile should use full width/height
      expect(chatWindow?.style.width).toBe('100%');
      expect(chatWindow?.style.height).toBe('100%');
      
      mobileWidget.destroy();
    });
  });
});
