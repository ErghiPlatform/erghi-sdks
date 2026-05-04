/**
 * ChatFlow .NET SDK — Simulation / Integration Example
 *
 * Exercises AIChatClient against a locally running ChatFlow stack.
 *   docker-compose up   →   gateway on http://localhost:5000
 *
 * Run:
 *   cd chatflow-sdks/dotnet/examples
 *   dotnet run
 */

using ChatFlow.SDK;
using ChatFlow.SDK.Models;

var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
var testEmail = $"demo_{timestamp}@chatflow.dev";
const string TestPassword = "Demo@12345!";

Console.WriteLine("=== ChatFlow .NET SDK Simulation ===\n");

await using var client = new AIChatClient(new AIChatConfig
{
    ApiUrl = "http://localhost:5000",
    Debug = true,
});

try
{
    // ── 1. Register ───────────────────────────────────────────────────────
    Console.WriteLine($"▶ Registering: {testEmail}");
    var auth = await client.Auth.RegisterAsync(new RegisterRequest(
        Email: testEmail,
        Password: TestPassword,
        FirstName: "Demo",
        LastName: "User"
    ));
    Console.WriteLine($"✓ Registered. Token type: {auth.TokenType}");
    Console.WriteLine($"  User ID: {auth.User.Id}");

    // ── 2. Login ──────────────────────────────────────────────────────────
    Console.WriteLine("\n▶ Logging in…");
    var login = await client.Auth.LoginAsync(new LoginRequest(testEmail, TestPassword));
    Console.WriteLine($"✓ Logged in. Token (truncated): {login.AccessToken[..20]}…");

    // ── 3. Create workspace ───────────────────────────────────────────────
    Console.WriteLine("\n▶ Creating workspace…");
    var workspace = await client.Workspace.CreateAsync(
        new CreateWorkspaceRequest(Name: $"Demo Workspace {timestamp}")
    );
    Console.WriteLine($"✓ Workspace: {workspace.Id} / {workspace.Name}");

    // ── 4. Create conversation ────────────────────────────────────────────
    Console.WriteLine("\n▶ Creating conversation…");
    var conversation = await client.Chat.CreateConversationAsync(
        new CreateConversationRequest(
            WidgetId: "demo-widget",
            Metadata: new() { ["source"] = "dotnet-simulation" }
        )
    );
    Console.WriteLine($"✓ Conversation: {conversation.Id} / status: {conversation.Status}");

    // ── 5. Connect SignalR hub ────────────────────────────────────────────
    Console.WriteLine("\n▶ Connecting to hub…");

    client.MessageReceived += msg =>
        Console.WriteLine($"  📨 [REALTIME] {msg.Sender}: \"{msg.Content}\"");

    client.UserTyping += evt =>
        Console.WriteLine($"  ✍️  [REALTIME] {evt.UserId} typing: {evt.IsTyping}");

    client.Connected += () =>
        Console.WriteLine("  🟢 Hub connected event fired");

    await client.ConnectAsync();
    Console.WriteLine("✓ Hub connected");

    // ── 6. Join conversation room ─────────────────────────────────────────
    await client.JoinConversationAsync(conversation.Id);
    Console.WriteLine("✓ Joined conversation room");

    // ── 7. Send messages ──────────────────────────────────────────────────
    var messages = new[]
    {
        "Hello from the .NET SDK simulation!",
        "Can you help me with my order?",
        "What are your business hours?"
    };

    Console.WriteLine("\n▶ Sending messages…");
    foreach (var content in messages)
    {
        var msg = await client.Chat.SendMessageAsync(
            conversation.Id,
            new SendMessageRequest(content)
        );
        Console.WriteLine($"  ✓ Sent [{msg.Id}]: \"{msg.Content}\"");
        await Task.Delay(300);
    }

    // ── 8. Fetch message history ──────────────────────────────────────────
    Console.WriteLine("\n▶ Fetching message history…");
    var history = await client.Chat.GetMessagesAsync(conversation.Id);
    Console.WriteLine($"  ✓ {history.Data.Count} messages (total: {history.Total})");

    // ── 9. Typing indicator ───────────────────────────────────────────────
    Console.WriteLine("\n▶ Sending typing indicators…");
    await client.SendTypingAsync(conversation.Id, isTyping: true);
    await Task.Delay(500);
    await client.SendTypingAsync(conversation.Id, isTyping: false);
    Console.WriteLine("  ✓ Done");

    // ── 10. Close conversation ────────────────────────────────────────────
    Console.WriteLine("\n▶ Closing conversation…");
    var closed = await client.Chat.CloseConversationAsync(conversation.Id);
    Console.WriteLine($"  ✓ Status: {closed.Status}");

    // ── 11. Disconnect ────────────────────────────────────────────────────
    await client.DisconnectAsync();
    Console.WriteLine("\n✅ Simulation complete!\n");
}
catch (Exception ex)
{
    Console.Error.WriteLine($"\n❌ Simulation failed: {ex.Message}");
    Environment.Exit(1);
}
