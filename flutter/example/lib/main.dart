/// Erghi Flutter SDK — Simulation / Integration Example
///
/// A minimal Flutter application that demonstrates the full chat flow
/// against a locally running Erghi stack (http://localhost:5000).
///
/// To run:
///   cd erghi-sdks/flutter
///   flutter run -d chrome        # or any connected device

import 'package:flutter/material.dart';
import 'package:aichat_sdk/src/aichat_client.dart';
import 'package:aichat_sdk/src/config/aichat_config.dart';
import 'package:aichat_sdk/src/models/conversation.dart';
import 'package:aichat_sdk/src/models/user.dart';

void main() {
  runApp(const SimulationApp());
}

// ── App root ─────────────────────────────────────────────────────────────────

class SimulationApp extends StatelessWidget {
  const SimulationApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Erghi Flutter Demo',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF6366F1),
        useMaterial3: true,
      ),
      home: const SimulationPage(),
    );
  }
}

// ── Main simulation page ──────────────────────────────────────────────────────

class SimulationPage extends StatefulWidget {
  const SimulationPage({super.key});

  @override
  State<SimulationPage> createState() => _SimulationPageState();
}

class _SimulationPageState extends State<SimulationPage> {
  final AIChatClient _client = AIChatClient(
    config: AIChatConfig(
      apiUrl: 'http://localhost:5000',
      debug: true,
    ),
  );

  // ── Auth form state ──────────────────────────────────────────────────────
  bool _isRegistering = true;
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _firstNameCtrl = TextEditingController(text: 'Demo');

  // ── Chat state ───────────────────────────────────────────────────────────
  bool _isLoggedIn = false;
  String? _conversationId;
  List<Map<String, dynamic>> _messages = [];
  bool _isConnected = false;
  String _error = '';

  final _msgCtrl = TextEditingController();
  final ScrollController _scrollCtrl = ScrollController();

  @override
  void initState() {
    super.initState();
    // Listen to WebSocket messages
    _client.messageStream?.listen((msg) {
      setState(() => _messages.add(msg.toJson()));
      _scrollToBottom();
    });
  }

  @override
  void dispose() {
    _client.disconnectWebSocket();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _firstNameCtrl.dispose();
    _msgCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  Future<void> _authenticate() async {
    setState(() => _error = '');
    try {
      AuthResponse auth;
      if (_isRegistering) {
        auth = await _client.auth.register(
          RegisterRequest(
            email: _emailCtrl.text.trim(),
            password: _passwordCtrl.text,
            firstName: _firstNameCtrl.text.trim(),
            lastName: 'User',
          ),
        );
      } else {
        auth = await _client.auth.login(
          LoginRequest(
            email: _emailCtrl.text.trim(),
            password: _passwordCtrl.text,
          ),
        );
      }
      debugPrint('Logged in: ${auth.user.email}');
      setState(() => _isLoggedIn = true);
      await _setupChat();
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  // ── Chat setup ────────────────────────────────────────────────────────────

  Future<void> _setupChat() async {
    try {
      // Connect WebSocket
      await _client.connectWebSocket();

      // Create a conversation
      final conv = await _client.chat.createConversation(
        widgetId: 'demo-widget',
        metadata: {'source': 'flutter-simulation'},
      );
      setState(() => _conversationId = conv.id);

      // Join the conversation room
      _client.joinConversation(conv.id);

      // Load history
      final history = await _client.chat.getMessages(conv.id);
      setState(() => _messages = history.data.map((m) => m.toJson()).toList());
      _scrollToBottom();
    } catch (e) {
      debugPrint('Chat setup error: $e');
    }
  }

  Future<void> _sendMessage() async {
    final text = _msgCtrl.text.trim();
    if (text.isEmpty || _conversationId == null) return;
    _msgCtrl.clear();
    try {
      final msg = await _client.chat.sendMessage(
        _conversationId!,
        SendMessageRequest(content: text),
      );
      setState(() => _messages.add(msg.toJson()));
      _scrollToBottom();
    } catch (e) {
      debugPrint('Send error: $e');
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: const Text('Erghi Flutter SDK Demo'),
        backgroundColor: const Color(0xFF6366F1),
        foregroundColor: Colors.white,
        actions: [
          if (_isLoggedIn)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Chip(
                label: Text(
                  _isConnected ? '● Connected' : '○ Offline',
                  style: const TextStyle(fontSize: 11),
                ),
                backgroundColor: _isConnected
                    ? const Color(0xFF22C55E)
                    : const Color(0xFFEF4444),
                labelStyle: const TextStyle(color: Colors.white),
              ),
            ),
        ],
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: _isLoggedIn ? _buildChatView() : _buildAuthView(),
        ),
      ),
    );
  }

  // ── Auth view ────────────────────────────────────────────────────────────

  Widget _buildAuthView() {
    return Card(
      margin: const EdgeInsets.all(24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      elevation: 6,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              _isRegistering ? 'Create Account' : 'Sign In',
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF1E1B4B)),
            ),
            const SizedBox(height: 20),
            if (_isRegistering)
              TextField(
                controller: _firstNameCtrl,
                decoration: const InputDecoration(labelText: 'First Name'),
              ),
            const SizedBox(height: 8),
            TextField(
              controller: _emailCtrl,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _passwordCtrl,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password'),
            ),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(_error, style: const TextStyle(color: Colors.red, fontSize: 13)),
            ],
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _authenticate,
              style: FilledButton.styleFrom(backgroundColor: const Color(0xFF6366F1)),
              child: Text(_isRegistering ? 'Register' : 'Login'),
            ),
            TextButton(
              onPressed: () => setState(() => _isRegistering = !_isRegistering),
              child: Text(
                _isRegistering ? 'Already have an account? Login' : "Don't have an account? Register",
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Chat view ────────────────────────────────────────────────────────────

  Widget _buildChatView() {
    return Card(
      margin: const EdgeInsets.all(16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      elevation: 6,
      child: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollCtrl,
              padding: const EdgeInsets.all(12),
              itemCount: _messages.length,
              itemBuilder: (_, i) {
                final msg = _messages[i];
                final isOwn = (msg['sender'] ?? '') == 'user';
                return Align(
                  alignment: isOwn ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: isOwn ? const Color(0xFF6366F1) : const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      msg['content'] ?? '',
                      style: TextStyle(color: isOwn ? Colors.white : Colors.black87),
                    ),
                  ),
                );
              },
            ),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _msgCtrl,
                    decoration: const InputDecoration(
                      hintText: 'Type a message…',
                      border: InputBorder.none,
                    ),
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.send, color: Color(0xFF6366F1)),
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
