# Erghi Flutter SDK

Official Flutter SDK for the [Erghi Platform](https://erghi.ai) — Build AI-powered chat experiences in your iOS and Android apps.

[![pub package](https://img.shields.io/pub/v/erghi_sdk.svg)](https://pub.dev/packages/erghi_sdk)
[![Flutter](https://img.shields.io/badge/Flutter-3.10+-blue.svg)](https://flutter.dev)

## Features

- ✅ Full type-safe API with null safety
- 🔐 JWT authentication with auto-refresh
- 💬 Real-time messaging with WebSocket
- 📱 iOS and Android support
- 🎨 Material Design widgets
- 📦 Minimal dependencies
- 🧪 Fully tested

## Installation

Add to your `pubspec.yaml`:

```yaml
dependencies:
  erghi_sdk: ^1.0.0
```

Then run:

```bash
flutter pub get
```

## Quick Start

### Initialize the Client

```dart
import 'package:erghi_sdk/erghi_sdk.dart';

final client = ErghiClient(
  config: ErghiConfig(
    apiUrl: 'https://api.erghi.ai',
    debug: true,
  ),
);
```

### Authentication

```dart
// Register
final auth = await client.auth.register(
  RegisterRequest(
    email: 'user@example.com',
    password: 'SecurePass123!',
    firstName: 'John',
    lastName: 'Doe',
  ),
);

// Login
final auth = await client.auth.login(
  LoginRequest(
    email: 'user@example.com',
    password: 'SecurePass123!',
  ),
);

// Get current user
final user = await client.auth.me();

// Logout
await client.auth.logout();
```

### Chat Operations

```dart
// Create conversation
final conversation = await client.chat.createConversation(
  widgetId: 'your-widget-id',
  metadata: {'page': '/products'},
);

// Get messages
final messages = await client.chat.getMessages(
  conversation.id,
  page: 1,
  limit: 50,
);

// Send message
final message = await client.chat.sendMessage(
  conversation.id,
  SendMessageRequest(
    content: 'Hello!',
    type: MessageType.text,
  ),
);

// Mark as read
await client.chat.markAsRead(conversation.id);
```

### Real-Time with WebSocket

```dart
// Connect to WebSocket
await client.connectWebSocket();

// Join conversation
client.joinConversation(conversationId);

// Listen for messages
client.messageStream?.listen((message) {
  print('New message: ${message.content}');
});

// Send typing indicator
client.sendTyping(conversationId);

// Leave conversation
client.leaveConversation(conversationId);

// Disconnect
client.disconnectWebSocket();
```

## Complete Example

```dart
import 'package:flutter/material.dart';
import 'package:erghi_sdk/erghi_sdk.dart';

class ChatScreen extends StatefulWidget {
  final String conversationId;

  const ChatScreen({required this.conversationId});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  late final ErghiClient _client;
  final _messageController = TextEditingController();
  final List<Message> _messages = [];

  @override
  void initState() {
    super.initState();
    _initializeChat();
  }

  Future<void> _initializeChat() async {
    _client = ErghiClient(
      config: ErghiConfig(
        apiUrl: 'https://api.erghi.ai',
        debug: true,
      ),
    );

    // Connect WebSocket
    await _client.connectWebSocket();
    _client.joinConversation(widget.conversationId);

    // Listen for messages
    _client.messageStream?.listen((message) {
      setState(() {
        _messages.add(message);
      });
    });

    // Load initial messages
    final response = await _client.chat.getMessages(widget.conversationId);
    setState(() {
      _messages.addAll(response.items);
    });
  }

  Future<void> _sendMessage() async {
    if (_messageController.text.isEmpty) return;

    final message = await _client.chat.sendMessage(
      widget.conversationId,
      SendMessageRequest(content: _messageController.text),
    );

    setState(() {
      _messages.add(message);
      _messageController.clear();
    });
  }

  @override
  void dispose() {
    _client.dispose();
    _messageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Chat')),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final message = _messages[index];
                return ListTile(
                  title: Text(message.content),
                  subtitle: Text(message.createdAt.toString()),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    decoration: InputDecoration(hintText: 'Type a message'),
                    onChanged: (_) => _client.sendTyping(widget.conversationId),
                  ),
                ),
                IconButton(
                  icon: Icon(Icons.send),
                  onPressed: _sendMessage,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
```

## Error Handling

```dart
try {
  await client.auth.login(LoginRequest(
    email: 'user@example.com',
    password: 'wrong-password',
  ));
} on AuthenticationException catch (e) {
  print('Auth error: ${e.message}');
} on NetworkException catch (e) {
  print('Network error: ${e.message}');
} on ErghiException catch (e) {
  print('Error: ${e.message}');
}
```

## Platform-Specific Setup

### Android

Add to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

### iOS

No additional setup required!

## API Documentation

### ErghiClient

- `auth` - Authentication operations
- `chat` - Chat operations
- `connectWebSocket()` - Connect to real-time updates
- `disconnectWebSocket()` - Disconnect WebSocket
- `messageStream` - Stream of real-time messages
- `sendTyping()` - Send typing indicator
- `joinConversation()` - Join conversation room
- `leaveConversation()` - Leave conversation room
- `dispose()` - Clean up resources

### Models

- `User` - User model
- `AuthResponse` - Authentication response
- `Conversation` - Conversation model
- `Message` - Message model
- `Widget` - Widget model
- `PaginatedResponse<T>` - Paginated data

### Exceptions

- `ErghiException` - Base exception
- `AuthenticationException` - Auth errors
- `NetworkException` - Network errors
- `ValidationException` - Validation errors
- `NotFoundException` - Resource not found
- `WebSocketException` - WebSocket errors

## Development

```bash
# Get dependencies
flutter pub get

# Run code generation
flutter pub run build_runner build

# Run tests
flutter test

# Analyze code
flutter analyze
```

## Contributing

Contributions are welcome! Please read our [contributing guide](CONTRIBUTING.md).

## License

MIT License - see [LICENSE](LICENSE) file

## Support

- 📧 Email: support@erghi.ai
- 💬 Discord: [Join our community](https://discord.gg/erghi)
- 📝 Issues: [GitHub Issues](https://github.com/ErghiPlatform/erghi-sdks/issues)

---

Made with ❤️ by the Erghi team
