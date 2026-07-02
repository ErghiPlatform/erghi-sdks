# Erghi SDKs

Official client SDKs for the [Erghi Platform](https://erghi.com) — AI-powered customer engagement with real-time messaging, smart responses, and seamless integrations.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub repo](https://img.shields.io/badge/GitHub-ErghiPlatform%2Ferghi--sdks-blue.svg)](https://github.com/ErghiPlatform/erghi-sdks)

---

## Available SDKs

| SDK | Package | Version | Docs |
|-----|---------|---------|------|
| [JavaScript / TypeScript](#javascript--typescript) | `@aichat/sdk` | ![npm](https://img.shields.io/npm/v/@aichat/sdk) | [README](./javascript/README.md) |
| [React](#react) | `@aichat/react` | ![npm](https://img.shields.io/npm/v/@aichat/react) | [README](./react/README.md) |
| [Angular](#angular) | `@erghi/angular` | ![npm](https://img.shields.io/npm/v/@erghi/angular) | [README](./angular/README.md) |
| [Widget (Vanilla JS)](#widget) | `@erghi/widget` | ![npm](https://img.shields.io/npm/v/@erghi/widget) | [README](./widget/README.md) |
| [.NET / C#](#net--c) | `Erghi.SDK` | ![NuGet](https://img.shields.io/nuget/v/Erghi.SDK) | [README](./dotnet/README.md) |
| [Python](#python) | `aichat-sdk` | ![PyPI](https://img.shields.io/pypi/v/aichat-sdk) | [README](./python/README.md) |
| [Flutter / Dart](#flutter--dart) | `aichat_sdk` | ![pub](https://img.shields.io/pub/v/aichat_sdk) | [README](./flutter/README.md) |
| [Swift](#swift) | `AIChatSDK` (SPM) | — | [README](./swift/README.md) |

---

## Quick Install

### JavaScript / TypeScript

```bash
npm install @aichat/sdk
```

```typescript
import AIChatClient from '@aichat/sdk';

const client = new AIChatClient({
  apiUrl: 'https://api.erghi.com',
  apiKey: 'your-api-key',
  workspaceId: 'your-workspace-id',
});

await client.auth.login({ email: 'user@example.com', password: 'password' });
client.connect();
```

→ [Full JavaScript/TypeScript docs](./javascript/README.md)

---

### React

```bash
npm install @aichat/react @aichat/sdk
```

```tsx
import { AIChatProvider, useAuth, useChat } from '@aichat/react';

function App() {
  return (
    <AIChatProvider config={{ apiUrl: 'https://api.erghi.com', apiKey: 'your-api-key' }}>
      <YourApp />
    </AIChatProvider>
  );
}
```

→ [Full React docs](./react/README.md)

---

### Angular

```bash
npm install @erghi/angular
```

```typescript
// app.config.ts
import { provideAIChatConfig } from '@erghi/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAIChatConfig({
      apiUrl: 'https://api.erghi.com',
      apiKey: 'your-api-key',
    }),
  ],
};
```

→ [Full Angular docs](./angular/README.md)

---

### Widget (Vanilla JS — Embeddable)

```bash
npm install @erghi/widget
```

```html
<script src="https://cdn.erghi.com/widget/latest/widget.min.js"></script>
<script>
  ErghiWidget.init({
    widgetId: 'your-widget-id',
    apiUrl: 'https://api.erghi.com',
  });
</script>
```

→ [Full Widget docs](./widget/README.md)

---

### .NET / C\#

```bash
dotnet add package Erghi.SDK
```

```csharp
using Erghi.SDK;

await using var client = new AIChatClient(new AIChatConfig
{
    ApiUrl = "https://api.erghi.com",
    ApiKey = "your-api-key",
});

var auth = await client.Auth.LoginAsync(new LoginRequest("user@example.com", "password"));
await client.ConnectAsync();  // SignalR real-time hub
```

→ [Full .NET docs](./dotnet/README.md)

---

### Python

```bash
pip install aichat-sdk
```

```python
from aichat import AIChatClient

async with AIChatClient(api_url="https://api.erghi.com", api_key="your-api-key") as client:
    await client.auth.login(email="user@example.com", password="password")
    conversation = await client.chat.create_conversation(widget_id="your-widget-id")
    await client.chat.send_message(conversation_id=conversation.id, content="Hello!")
```

→ [Full Python docs](./python/README.md)

---

### Flutter / Dart

```yaml
# pubspec.yaml
dependencies:
  aichat_sdk: ^1.0.0
```

```dart
import 'package:aichat_sdk/aichat_sdk.dart';

final client = AIChatClient(
  config: AIChatConfig(
    apiUrl: 'https://api.erghi.com',
    apiKey: 'your-api-key',
  ),
);

await client.auth.login(email: 'user@example.com', password: 'password');
```

→ [Full Flutter docs](./flutter/README.md)

---

### Swift

```swift
// Package.swift
.package(url: "https://github.com/ErghiPlatform/erghi-sdks", from: "2.0.0")
```

```swift
import AIChatSDK

let client = AIChatClient(config: AIChatConfig(
    apiUrl: "https://api.erghi.com",
    apiKey: "your-api-key"
))

try await client.auth.login(email: "user@example.com", password: "password")
```

→ [Full Swift docs](./swift/README.md)

---

## Platform Architecture

```
Erghi Platform
├── erghi-gateway-api     — API Gateway (routing, rate limiting)
├── erghi-identity-api    — Authentication & user management
├── erghi-conversation-api — Real-time chat with SignalR hub
├── erghi-ai-service      — AI response generation
├── erghi-admin-portal    — Agent & admin dashboard (Angular)
└── erghi-user-portal     — Public-facing landing page (Angular)

erghi-sdks (this repo)
├── javascript/   — Core JS/TS SDK
├── react/        — React hooks & provider
├── angular/      — Angular service & interceptors
├── widget/       — Embeddable vanilla JS widget
├── dotnet/       — .NET 10 SDK with SignalR
├── python/       — Async Python SDK
├── flutter/      — Flutter/Dart SDK
└── swift/        — Swift SDK (iOS/macOS/tvOS/watchOS)
```

## Authentication Flow

All SDKs follow the same authentication pattern:

1. **Register or Login** → receive `accessToken` + `refreshToken`
2. **SDK stores tokens** and attaches `Authorization: Bearer <token>` on every request
3. **Token refresh** happens automatically when the access token expires
4. **Real-time connection** (SignalR/WebSocket) is authenticated via the access token

```
Client → POST /api/auth/login → { accessToken, refreshToken }
Client → GET  /api/chat/...   → Authorization: Bearer <accessToken>
Client → WS   /hubs/chat      → ?access_token=<accessToken>
```

## API Base URLs

| Environment | Gateway URL |
|-------------|-------------|
| Production  | `https://api.erghi.com` |
| Staging     | `https://staging-api.erghi.com` |
| Local dev   | `http://localhost:5000` |

## Running Locally

Start the full platform with Docker Compose:

```bash
# Clone the main platform repo
git clone https://github.com/ErghiPlatform/Erghi.git
cd Erghi

# Start all services
docker compose up

# Gateway will be available at http://localhost:5000
```

Then point any SDK at `http://localhost:5000`.

## Contributing

See [CONTRIBUTING.md](https://github.com/ErghiPlatform/Erghi/blob/main/CONTRIBUTING.md) in the main platform repo.

## License

MIT — © 2026 Erghi Platform
