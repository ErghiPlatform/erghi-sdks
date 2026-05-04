/**
 * ChatFlow JavaScript SDK — Simulation / Integration Example
 *
 * Demonstrates the full chat flow against a locally running ChatFlow stack:
 *   docker-compose up   →   gateway on http://localhost:5000
 *
 * Run:
 *   npx ts-node examples/simulation.ts
 */

import { AIChatClient } from '../src';

const TIMESTAMP = Date.now();
const TEST_EMAIL = `demo_${TIMESTAMP}@chatflow.dev`;
const TEST_PASSWORD = 'Demo@12345!';

async function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== ChatFlow JavaScript SDK Simulation ===\n');

  // ── 1. Initialise client ─────────────────────────────────────────────────
  const client = new AIChatClient({
    apiUrl: 'http://localhost:5000',
    debug: true,
  });

  // ── 2. Register ───────────────────────────────────────────────────────────
  console.log('▶ Registering user:', TEST_EMAIL);
  const authResponse = await client.auth.register({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    firstName: 'Demo',
    lastName: 'User',
  });
  console.log('✓ Registered. Token type:', authResponse.tokenType);
  console.log('  User ID:', authResponse.user.id);

  // ── 3. Login ──────────────────────────────────────────────────────────────
  console.log('\n▶ Logging in…');
  const loginResponse = await client.auth.login({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  console.log('✓ Logged in. Access token (truncated):', loginResponse.accessToken.slice(0, 20) + '…');

  // ── 4. Create workspace ───────────────────────────────────────────────────
  console.log('\n▶ Creating workspace…');
  const workspace = await client.workspace.create({
    name: `Demo Workspace ${TIMESTAMP}`,
  });
  console.log('✓ Workspace created:', workspace.id, '/', workspace.name);

  // ── 5. Create widget ──────────────────────────────────────────────────────
  console.log('\n▶ Creating widget…');
  const widget = await client.chat.createWidget({
    name: 'Demo Widget',
    slug: `demo-${TIMESTAMP}`,
    configuration: { primaryColor: '#6366f1', position: 'bottom-right' },
  });
  console.log('✓ Widget created:', widget.id);

  // ── 6. Create conversation ────────────────────────────────────────────────
  console.log('\n▶ Creating conversation…');
  const conversation = await client.chat.createConversation({
    widgetId: widget.id,
    metadata: { source: 'simulation' },
  });
  console.log('✓ Conversation created:', conversation.id, '/ status:', conversation.status);

  // ── 7. Connect WebSocket ──────────────────────────────────────────────────
  console.log('\n▶ Connecting WebSocket…');
  await client.connect();
  console.log('✓ WebSocket connected');

  // Register real-time event handlers
  client.on('message.received', (msg: any) => {
    console.log(`  📨 [REALTIME] Message from ${msg.sender}: "${msg.content}"`);
  });

  client.on('user.typing', (evt: any) => {
    console.log(`  ✍️  [REALTIME] User ${evt.userId} typing: ${evt.isTyping}`);
  });

  // ── 8. Join conversation room ─────────────────────────────────────────────
  await client.joinConversation(conversation.id);
  console.log('✓ Joined conversation room');

  // ── 9. Send messages ──────────────────────────────────────────────────────
  const messages = [
    'Hello from the JavaScript SDK simulation!',
    'Can you help me with my order?',
    'What are your business hours?',
  ];

  console.log('\n▶ Sending messages…');
  for (const content of messages) {
    const msg = await client.chat.sendMessage(conversation.id, { content });
    console.log(`  ✓ Sent [${msg.id}]: "${msg.content}"`);
    await sleep(300);
  }

  // ── 10. List messages ─────────────────────────────────────────────────────
  console.log('\n▶ Fetching message history…');
  const history = await client.chat.getMessages(conversation.id);
  console.log(`  ✓ ${history.data.length} messages retrieved (total: ${history.total})`);

  // ── 11. Typing indicator ──────────────────────────────────────────────────
  console.log('\n▶ Sending typing indicator…');
  await client.sendTyping(conversation.id, true);
  await sleep(500);
  await client.sendTyping(conversation.id, false);
  console.log('  ✓ Typing indicators sent');

  // ── 12. Close conversation ────────────────────────────────────────────────
  console.log('\n▶ Closing conversation…');
  const closed = await client.chat.closeConversation(conversation.id);
  console.log('  ✓ Conversation status:', closed.status);

  // ── 13. Disconnect ────────────────────────────────────────────────────────
  await client.disconnect();
  console.log('\n✅ Simulation complete!\n');
}

main().catch((err) => {
  console.error('❌ Simulation failed:', err.message ?? err);
  process.exit(1);
});
