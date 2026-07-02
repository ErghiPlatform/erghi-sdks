"""
Erghi Python SDK — Simulation / Integration Example

Demonstrates the full chat flow against a locally running Erghi stack:
  docker-compose up   ->   gateway on http://localhost:5000

Run:
  pip install aichat-sdk
  python examples/simulation.py
"""

import asyncio
import time
from aichat import AIChatClient

TIMESTAMP = int(time.time())
TEST_EMAIL = f"demo_{TIMESTAMP}@erghi.dev"
TEST_PASSWORD = "Demo@12345!"


async def main() -> None:
    print("=== Erghi Python SDK Simulation ===\n")

    # ── 1. Initialise client ──────────────────────────────────────────────────
    async with AIChatClient(
        api_url="http://localhost:5000",
        debug=True,
    ) as client:

        # ── 2. Register ───────────────────────────────────────────────────────
        print(f"▶ Registering user: {TEST_EMAIL}")
        auth = await client.auth.register(
            email=TEST_EMAIL,
            password=TEST_PASSWORD,
            first_name="Demo",
            last_name="User",
        )
        print(f"✓ Registered. Token type: {auth['tokenType']}")
        print(f"  User ID: {auth['user']['id']}")

        # ── 3. Login ──────────────────────────────────────────────────────────
        print("\n▶ Logging in…")
        login = await client.auth.login(email=TEST_EMAIL, password=TEST_PASSWORD)
        print(f"✓ Logged in. Access token (truncated): {login['accessToken'][:20]}…")

        # ── 4. Create workspace ───────────────────────────────────────────────
        print("\n▶ Creating workspace…")
        workspace = await client.workspace.create(name=f"Demo Workspace {TIMESTAMP}")
        print(f"✓ Workspace created: {workspace['id']} / {workspace['name']}")

        # ── 5. Create widget ──────────────────────────────────────────────────
        print("\n▶ Creating widget…")
        widget = await client.chat.create_widget(
            name="Demo Widget",
            slug=f"demo-{TIMESTAMP}",
            configuration={"primaryColor": "#6366f1", "position": "bottom-right"},
        )
        print(f"✓ Widget created: {widget['id']}")

        # ── 6. Create conversation ────────────────────────────────────────────
        print("\n▶ Creating conversation…")
        conversation = await client.chat.create_conversation(
            widget_id=widget["id"],
            metadata={"source": "simulation"},
        )
        print(f"✓ Conversation created: {conversation['id']} / status: {conversation['status']}")

        # ── 7. Connect WebSocket ──────────────────────────────────────────────
        print("\n▶ Connecting WebSocket…")
        await client.connect()
        print("✓ WebSocket connected")

        # Register real-time event handlers
        def on_message(msg: dict) -> None:
            print(f"  📨 [REALTIME] Message from {msg['sender']}: \"{msg['content']}\"")

        def on_typing(evt: dict) -> None:
            print(f"  ✍️  [REALTIME] User {evt['userId']} typing: {evt['isTyping']}")

        client.on("message.received", on_message)
        client.on("user.typing", on_typing)

        # ── 8. Join conversation room ─────────────────────────────────────────
        await client.join_conversation(conversation["id"])
        print("✓ Joined conversation room")

        # ── 9. Send messages ──────────────────────────────────────────────────
        messages = [
            "Hello from the Python SDK simulation!",
            "Can you help me with my order?",
            "What are your business hours?",
        ]

        print("\n▶ Sending messages…")
        for content in messages:
            msg = await client.chat.send_message(
                conversation["id"],
                content=content,
            )
            print(f"  ✓ Sent [{msg['id']}]: \"{msg['content']}\"")
            await asyncio.sleep(0.3)

        # ── 10. List messages ─────────────────────────────────────────────────
        print("\n▶ Fetching message history…")
        history = await client.chat.get_messages(conversation["id"])
        print(f"  ✓ {len(history['data'])} messages retrieved (total: {history['total']})")

        # ── 11. Typing indicator ──────────────────────────────────────────────
        print("\n▶ Sending typing indicator…")
        await client.send_typing(conversation["id"], is_typing=True)
        await asyncio.sleep(0.5)
        await client.send_typing(conversation["id"], is_typing=False)
        print("  ✓ Typing indicators sent")

        # ── 12. Close conversation ────────────────────────────────────────────
        print("\n▶ Closing conversation…")
        closed = await client.chat.close_conversation(conversation["id"])
        print(f"  ✓ Conversation status: {closed['status']}")

        print("\n✅ Simulation complete!\n")


if __name__ == "__main__":
    asyncio.run(main())
