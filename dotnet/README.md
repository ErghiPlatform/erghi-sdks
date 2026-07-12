# Erghi .NET SDK

Official .NET 10 SDK for [Erghi](https://erghi.com) — Real-time customer chat with SignalR integration.

[![NuGet](https://img.shields.io/nuget/v/Erghi.SDK.svg)](https://www.nuget.org/packages/Erghi.SDK)
[![.NET](https://img.shields.io/badge/.NET-10.0-purple.svg)](https://dotnet.microsoft.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)

## Features

- ✅ Full async/await API with `CancellationToken` support
- 🔐 JWT authentication with automatic token management
- 💬 Real-time messaging via SignalR hub
- 🔄 Automatic reconnection with exponential backoff
- 📦 Strongly-typed models with nullable reference types
- 🛠️ Dependency injection friendly
- 🧪 Fully tested against the live Erghi stack

## Requirements

- .NET 10.0+
- `Microsoft.AspNetCore.SignalR.Client` 10.0.0

## Installation

```bash
dotnet add package Erghi.SDK
```

Or via the NuGet Package Manager:

```
Install-Package Erghi.SDK
```

## Quick Start

```csharp
using Erghi.SDK;
using Erghi.SDK.Models;

await using var client = new ErghiClient(new ErghiConfig
{
    ApiUrl = "https://api.erghi.com",
    ApiKey = "your-api-key",
    Debug = true,
});

// Register a new user
var auth = await client.Auth.RegisterAsync(new RegisterRequest(
    Email: "user@example.com",
    Password: "SecurePassword123!",
    FirstName: "Jane",
    LastName: "Doe"
));

// Or login an existing user
var login = await client.Auth.LoginAsync(
    new LoginRequest("user@example.com", "SecurePassword123!")
);

// Create a conversation
var conversation = await client.Chat.CreateConversationAsync(
    new CreateConversationRequest(WidgetId: "your-widget-id")
);

// Connect to the real-time SignalR hub
client.MessageReceived += msg =>
    Console.WriteLine($"[{msg.Sender}]: {msg.Content}");

await client.ConnectAsync();
await client.JoinConversationAsync(conversation.Id);

// Send a message
var message = await client.Chat.SendMessageAsync(
    conversation.Id,
    new SendMessageRequest("Hello, I need help!")
);

Console.WriteLine($"Sent: {message.Id}");
```

## Configuration

```csharp
var config = new ErghiConfig
{
    // Base URL of the Erghi API gateway (default: http://localhost:5000)
    ApiUrl = "https://api.erghi.com",

    // Optional: override SignalR hub URL (derived from ApiUrl when not set)
    // Default: {ApiUrl}/hubs/chat
    HubUrl = "https://api.erghi.com/hubs/chat",

    // API key for widget/server-side authentication
    ApiKey = "your-api-key",

    // JWT access token (if you already have one)
    AccessToken = "existing-jwt-token",

    // Workspace ID — sent as X-Workspace-Id header on every request
    WorkspaceId = "your-workspace-id",

    // HTTP request timeout (default: 30 seconds)
    Timeout = TimeSpan.FromSeconds(30),

    // Enable console debug logging (default: false)
    Debug = true,
};
```

## Authentication

### Register

```csharp
var auth = await client.Auth.RegisterAsync(new RegisterRequest(
    Email: "user@example.com",
    Password: "SecurePassword123!",
    FirstName: "John",
    LastName: "Doe"
));

Console.WriteLine($"User ID: {auth.User.Id}");
Console.WriteLine($"Token: {auth.AccessToken}");
```

### Login

```csharp
var auth = await client.Auth.LoginAsync(
    new LoginRequest("user@example.com", "SecurePassword123!")
);
```

### Refresh Token

```csharp
var refreshed = await client.Auth.RefreshAsync(auth.RefreshToken);
```

### Get Current User

```csharp
var user = await client.Auth.MeAsync();
Console.WriteLine($"Hello, {user.FirstName}!");
```

### Logout

```csharp
await client.Auth.LogoutAsync();
```

## Chat Operations

### Create a Conversation

```csharp
var conversation = await client.Chat.CreateConversationAsync(
    new CreateConversationRequest(
        WidgetId: "your-widget-id",
        Metadata: new Dictionary<string, string>
        {
            ["source"] = "dotnet-app",
            ["page"] = "/checkout",
        }
    )
);
```

### Send a Message

```csharp
var message = await client.Chat.SendMessageAsync(
    conversation.Id,
    new SendMessageRequest("Hello! I need help with my order.")
);
```

### Get Message History

```csharp
var history = await client.Chat.GetMessagesAsync(conversation.Id);

Console.WriteLine($"{history.Total} total messages");
foreach (var msg in history.Data)
{
    Console.WriteLine($"[{msg.CreatedAt:HH:mm}] {msg.Sender}: {msg.Content}");
}
```

### Close a Conversation

```csharp
var closed = await client.Chat.CloseConversationAsync(conversation.Id);
Console.WriteLine($"Status: {closed.Status}"); // Closed
```

## Real-Time Events (SignalR)

### Connect and Subscribe

```csharp
// Subscribe to events before connecting
client.MessageReceived += msg =>
    Console.WriteLine($"📨 New message from {msg.Sender}: {msg.Content}");

client.UserTyping += evt =>
    Console.WriteLine($"✍️  User {evt.UserId} is typing: {evt.IsTyping}");

client.UserOnline += userId =>
    Console.WriteLine($"🟢 {userId} came online");

client.UserOffline += userId =>
    Console.WriteLine($"🔴 {userId} went offline");

client.Connected += () =>
    Console.WriteLine("Hub connected");

client.Disconnected += ex =>
    Console.WriteLine($"Hub disconnected: {ex?.Message}");

// Connect (must be authenticated first)
await client.ConnectAsync();
```

### Join / Leave Conversation Rooms

```csharp
// Join a room to receive its messages
await client.JoinConversationAsync(conversation.Id);

// Leave when done
await client.LeaveConversationAsync(conversation.Id);
```

### Typing Indicators

```csharp
// Broadcast "user is typing" to other participants
await client.SendTypingAsync(conversation.Id, isTyping: true);

// Broadcast "user stopped typing"
await client.SendTypingAsync(conversation.Id, isTyping: false);
```

### Disconnect

```csharp
await client.DisconnectAsync();
```

## Identity Verification & Webhooks

`ErghiHmac` is a static utility for server-side use only — never call it from a browser or mobile
client, since it requires your workspace's secret key.

```csharp
using Erghi.SDK;

// On your backend, after the user logs in:
var identityHash = ErghiHmac.GenerateIdentityHash(currentUser.Id, Environment.GetEnvironmentVariable("ERGHI_WIDGET_SECRET")!);
// Send `identityHash` and `currentUser.Id` to your frontend so the widget can prove the visitor's identity.
```

Verifying an incoming webhook:

```csharp
using Erghi.SDK;

[HttpPost("webhooks/erghi")]
public async Task<IActionResult> HandleWebhook()
{
    using var reader = new StreamReader(Request.Body);
    var payload = await reader.ReadToEndAsync();
    var signature = Request.Headers["X-Erghi-Signature"].ToString();

    if (!ErghiHmac.VerifyWebhookSignature(payload, signature, _webhookSecret))
    {
        return Unauthorized();
    }

    // ... process the event
    return Ok();
}
```

## Workspace Management

```csharp
// List workspaces
var workspaces = await client.Workspace.ListAsync();

// Create a workspace
var workspace = await client.Workspace.CreateAsync(
    new CreateWorkspaceRequest(Name: "Acme Corp")
);

Console.WriteLine($"Workspace ID: {workspace.Id}");
```

## Error Handling

```csharp
using Erghi.SDK.Errors;

try
{
    await client.Auth.LoginAsync(new LoginRequest("bad@email.com", "wrong"));
}
catch (AuthenticationException ex)
{
    Console.Error.WriteLine($"Login failed: {ex.Message}");
}
catch (ValidationException ex)
{
    Console.Error.WriteLine($"Validation error: {ex.Message}");
}
catch (NetworkException ex)
{
    Console.Error.WriteLine($"Network error: {ex.Message}");
    // ex.InnerException contains the original HttpRequestException
}
catch (ErghiException ex)
{
    // Base exception for all Erghi SDK errors
    Console.Error.WriteLine($"SDK error [{ex.StatusCode}]: {ex.Message}");
}
```

| Exception | When thrown |
|-----------|-------------|
| `AuthenticationException` | 401 — invalid credentials or expired token |
| `ValidationException` | 422 — request failed validation |
| `NetworkException` | Connection failure or SignalR error |
| `ErghiException` | Base class — any other API error |

## Dependency Injection

Use the SDK in ASP.NET Core apps with DI:

```csharp
// Program.cs
builder.Services.AddSingleton(new ErghiConfig
{
    ApiUrl = builder.Configuration["Erghi:ApiUrl"]!,
    ApiKey = builder.Configuration["Erghi:ApiKey"],
    WorkspaceId = builder.Configuration["Erghi:WorkspaceId"],
});

builder.Services.AddScoped<ErghiClient>();
```

```csharp
// appsettings.json
{
  "Erghi": {
    "ApiUrl": "https://api.erghi.com",
    "ApiKey": "your-api-key",
    "WorkspaceId": "your-workspace-id"
  }
}
```

```csharp
// MyService.cs
public class ChatService(ErghiClient client)
{
    public async Task<Message> SendSupportMessageAsync(string conversationId, string text)
    {
        return await client.Chat.SendMessageAsync(
            conversationId,
            new SendMessageRequest(text)
        );
    }
}
```

## Connection State

```csharp
// Check if the SignalR hub is connected
if (client.IsConnected)
{
    await client.SendTypingAsync(conversationId, true);
}
```

## Running the Example

```bash
# Clone the SDK repo
git clone https://github.com/ErghiPlatform/erghi-sdks.git
cd erghi-sdks/dotnet/examples

# Start the Erghi platform first (from the main repo)
# docker compose up

dotnet run
```

The example exercises the full flow: register → login → create workspace → create conversation → connect SignalR → send messages → fetch history → close conversation → disconnect.

## License

MIT — © 2026 Erghi Platform
