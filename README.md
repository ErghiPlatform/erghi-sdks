# Erghi SDKs

Official client SDKs for the [Erghi Platform](https://erghi.ai) — AI-powered customer engagement with real-time messaging, smart responses, and seamless integrations.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub repo](https://img.shields.io/badge/GitHub-ErghiPlatform%2Ferghi--sdks-blue.svg)](https://github.com/ErghiPlatform/erghi-sdks)

---

## Available SDKs

Tier meanings and the full per-capability breakdown (auth/chat/widgets/realtime/RAG/webhooks,
with file:line evidence) live in **[PARITY.md](./PARITY.md)** — generated from each package's
`parity.json`, not hand-maintained prose. Read that before assuming any SDK has (or lacks) a
capability.

| SDK | Package | Tier | Status | Docs |
|-----|---------|------|--------|------|
| [Widget (Vanilla JS)](#widget) | `@erghi-ai/widget` | 🟢 active | ![npm](https://img.shields.io/npm/v/@erghi-ai/widget) | [README](./widget/README.md) |
| [JavaScript / TypeScript](#javascript--typescript) | `@erghi-ai/sdk` | 🟢 active | ![npm](https://img.shields.io/npm/v/@erghi-ai/sdk) | [README](./javascript/README.md) |
| [React](#react) | `@erghi-ai/react` | 🟡 maintenance | ![npm](https://img.shields.io/npm/v/@erghi-ai/react) | [README](./react/README.md) |
| [Angular](#angular) | `@erghi-ai/angular` | 🟡 maintenance | ![npm](https://img.shields.io/npm/v/@erghi-ai/angular) | [README](./angular/README.md) |
| [.NET / C#](#net--c) | `Erghi.SDK` | 🟢 active | ![NuGet](https://img.shields.io/nuget/v/Erghi.SDK) | [README](./dotnet/README.md) |
| [Python](#python) | `erghi-sdk` | 🟢 active | ![PyPI](https://img.shields.io/pypi/v/erghi-sdk) | [README](./python/README.md) |
| [Flutter / Dart](#flutter--dart) | `erghi_sdk` | 🟢 active | ![pub](https://img.shields.io/pub/v/erghi_sdk) | [README](./flutter/README.md) |
| [Swift](#swift) | `ErghiSDK` (SPM) | 🟢 active | Published — tag `1.0.1` | [README](https://github.com/ErghiPlatform/erghi-sdk-swift#readme) |

🟢 **active** = gets build effort ahead of parity. 🟡 **maintenance** = real, working, tested,
still gets bug fixes and security patches, not proactively built ahead of parity (a founder-level
call — see [PARITY.md](./PARITY.md) for the reasoning per package).

---

## Quick Install

### JavaScript / TypeScript

```bash
npm install @erghi-ai/sdk
```

```typescript
import ErghiClient from '@erghi-ai/sdk';

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
npm install @erghi-ai/react @erghi-ai/sdk
```

```tsx
import { ErghiProvider, useAuth, useChat } from '@erghi-ai/react';

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
npm install @erghi-ai/angular
```

```typescript
// app.config.ts
import { ERGHI_CONFIG, ErghiConfig } from '@erghi-ai/angular';

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
npm install @erghi-ai/widget
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

Developed and maintained in its own repo — [`ErghiPlatform/erghi-sdk-swift`](https://github.com/ErghiPlatform/erghi-sdk-swift) — not here, since
Swift Package Manager requires `Package.swift` at the root of whatever git URL it's given,
which ruled out keeping it inside this monorepo. See that repo's README for full docs.

```swift
// Package.swift
.package(url: "https://github.com/ErghiPlatform/erghi-sdk-swift.git", from: "1.0.0")
```

```swift
import ErghiSDK

let client = ErghiClient(config: ErghiConfig(
    apiURL: URL(string: "https://api.erghi.ai")!,
    apiKey: "your-api-key"
))

try await client.auth.login(email: "user@example.com", password: "password")
```

→ [Full Swift docs](https://github.com/ErghiPlatform/erghi-sdk-swift#readme)

---

## Platform Architecture

```
Erghi Platform
├── erghi-gateway-api     — API Gateway (routing, rate limiting)
├── erghi-identity-api    — Authentication & user management
├── erghi-conversation-api — Real-time chat with SignalR hub
├── erghi-ai-service      — AI response generation
├── erghi-admin-portal    — Agent & admin dashboard (Angular)
└── erghi-widget-host     — Public-facing landing page (Angular)

erghi-sdks (this repo)
├── javascript/   — Core JS/TS SDK
├── react/        — React hooks & provider
├── angular/      — Angular service & interceptors
├── widget/       — Embeddable vanilla JS widget
├── dotnet/       — .NET 10 SDK with SignalR
├── python/       — Async Python SDK
└── flutter/      — Flutter/Dart SDK

erghi-sdk-swift (separate repo — SPM requires Package.swift at repo root)
└── Swift SDK (iOS/macOS/tvOS/watchOS)
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
