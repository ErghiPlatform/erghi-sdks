# Erghi SDKs

Official client SDKs for the [Erghi Platform](https://erghi.ai) — AI-powered customer engagement with real-time messaging, smart responses, and seamless integrations.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub repo](https://img.shields.io/badge/GitHub-ErghiPlatform%2Ferghi--sdks-blue.svg)](https://github.com/ErghiPlatform/erghi-sdks)

---

## Available SDKs

| SDK | Package | Status | Docs |
|-----|---------|--------|------|
| [Widget (Vanilla JS)](#widget) | `@erghi/widget` | ![npm](https://img.shields.io/npm/v/@erghi/widget) | [README](./widget/README.md) |
| [JavaScript / TypeScript](#javascript--typescript) | `@erghi/sdk` | ![npm](https://img.shields.io/npm/v/@erghi/sdk) | [README](./javascript/README.md) |
| [React](#react) | `@erghi/react` | Source-available¹ | [README](./react/README.md) |
| [Angular](#angular) | `@erghi/angular` | Source-available¹ | [README](./angular/README.md) |
| [.NET / C#](#net--c) | `Erghi.SDK` | Source-available¹ | [README](./dotnet/README.md) |
| [Python](#python) | `erghi-sdk` | Source-available¹ | [README](./python/README.md) |
| [Flutter / Dart](#flutter--dart) | `erghi_sdk` | Source-available¹ | [README](./flutter/README.md) |
| [Swift](#swift) | `ErghiSDK` (SPM) | Source-available¹ | [README](./swift/README.md) |

¹ Build from source for now — registry publishing is planned. [Open an issue](https://github.com/ErghiPlatform/erghi-sdks/issues) if you need a published package and we'll prioritize it.

---

## Quick Install

### JavaScript / TypeScript

```bash
npm install @erghi/sdk
```

```typescript
import ErghiClient from '@erghi/sdk';

const client = new ErghiClient({
  apiUrl: 'https://api.erghi.ai',
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
npm install @erghi/react @erghi/sdk
```

```tsx
import { ErghiProvider, useAuth, useChat } from '@erghi/react';

function App() {
  return (
    <ErghiProvider config={{ apiUrl: 'https://api.erghi.ai', apiKey: 'your-api-key' }}>
      <YourApp />
    </ErghiProvider>
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
import { ERGHI_CONFIG, ErghiConfig } from '@erghi/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: ERGHI_CONFIG,
      useValue: <ErghiConfig>{
        apiUrl: 'https://api.erghi.ai',
        apiKey: 'your-api-key',
      },
    },
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
<script src="https://cdn.erghi.ai/widget/latest/widget.min.js"></script>
<script>
  ErghiWidget.init({
    widgetId: 'your-widget-id',
    apiUrl: 'https://api.erghi.ai',
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

await using var client = new ErghiClient(new ErghiConfig
{
    ApiUrl = "https://api.erghi.ai",
    ApiKey = "your-api-key",
});

var auth = await client.Auth.LoginAsync(new LoginRequest("user@example.com", "password"));
await client.ConnectAsync();  // SignalR real-time hub
```

→ [Full .NET docs](./dotnet/README.md)

---

### Python

```bash
pip install erghi-sdk
```

```python
from erghi import ErghiClient

async with ErghiClient(api_url="https://api.erghi.ai", api_key="your-api-key") as client:
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
  erghi_sdk: ^1.0.0
```

```dart
import 'package:erghi_sdk/erghi_sdk.dart';

final client = ErghiClient(
  config: ErghiConfig(
    apiUrl: 'https://api.erghi.ai',
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
import ErghiSDK

let client = ErghiClient(config: ErghiConfig(
    apiUrl: "https://api.erghi.ai",
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
| Production  | `https://api.erghi.ai` |
| Staging     | `https://staging-api.erghi.ai` |
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
