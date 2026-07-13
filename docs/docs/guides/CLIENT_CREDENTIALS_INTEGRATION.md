# Machine-to-Machine (M2M) API Authentication & SDK Integration Guide

This guide details how to securely connect backend applications to the Erghi API using the **Client Credentials Flow** (Machine-to-Machine authentication).

---

## Overview

For backend services, cron jobs, or server-side integrations, using standard user login credentials is not secure or practical. Erghi supports the OAuth2 **Client Credentials** grant type, allowing you to authenticate using a `clientId` and `clientSecret`.

When you authenticate with client credentials:
1. Your server sends the `clientId` and `clientSecret` to the token exchange endpoint.
2. The server returns a JWT signed with the GoTrue JWT signing secret.
3. The SDKs automatically handle caching and refreshing this token so your requests remain authenticated.

---

## Key Management API

Before using M2M authentication, you must generate credentials for your workspace.

> [!NOTE]
> Key management endpoints require standard user authentication with an **Admin** role.

### 1. Generate Client Credentials
Create a new Client ID and Client Secret pair for a workspace.

```http
POST /api/v1/auth/keys
Authorization: Bearer <user-jwt-token>
Content-Type: application/json

{
  "workspaceId": "ws-uuid",
  "label": "Billing Service Sync Integration"
}
```

**Response `201 Created`**
```json
{
  "id": "cred-uuid",
  "workspaceId": "ws-uuid",
  "label": "Billing Service Sync Integration",
  "clientId": "cf_cl_9ab7c8e...",
  "clientSecret": "cf_sk_a2b9d8e7c6f5g4h3i2j1...",
  "createdAt": "2026-06-23T08:00:00Z"
}
```

> [!WARNING]
> The `clientSecret` is only returned once upon generation. Save it securely. It is hashed on the server using PBKDF2.

### 2. List Client Credentials
Retrieve all active credential pairs for your workspace.

```http
GET /api/v1/auth/keys?workspaceId=ws-uuid
Authorization: Bearer <user-jwt-token>
```

**Response `200 OK`**
```json
[
  {
    "id": "cred-uuid",
    "workspaceId": "ws-uuid",
    "label": "Billing Service Sync Integration",
    "clientId": "cf_cl_9ab7c8e...",
    "createdAt": "2026-06-23T08:00:00Z"
  }
]
```

### 3. Revoke Client Credentials
Immediately deactivate a credential pair. Any API calls using the revoked credentials will return `401 Unauthorized`.

```http
DELETE /api/v1/auth/keys/cred-uuid
Authorization: Bearer <user-jwt-token>
```

**Response `204 No Content`**

---

## Token Exchange Endpoint

This public endpoint is used by SDKs and external applications to exchange client credentials for a bearer token.

```http
POST /api/v1/auth/token
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "cf_cl_9ab7c8e...",
  "client_secret": "cf_sk_a2b9d8e7c6f5g4h3i2j1..."
}
```

**Response `200 OK`**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

---

## SDK Integration Examples

Official SDKs natively support client credentials. They will automatically intercept requests, retrieve a JWT, cache it, and transparently handle token expiration.

### 1. JavaScript/TypeScript (Node.js)

```typescript
import { ErghiClient } from '@erghi-sdk/javascript';

const client = new ErghiClient({
  apiUrl: 'https://api.erghi.ai',
  clientId: 'cf_cl_9ab7c8e...',
  clientSecret: 'cf_sk_a2b9d8e7c6f5g4h3i2j1...',
  workspaceId: 'ws-uuid'
});

// The client automatically fetches the token on the first request
const conversations = await client.chat.getConversations();
console.log(conversations);
```

---

### 2. Python

```python
import asyncio
from erghi import ErghiClient, ErghiConfig

async def main():
    config = ErghiConfig(
        api_url="https://api.erghi.ai",
        client_id="cf_cl_9ab7c8e...",
        client_secret="cf_sk_a2b9d8e7c6f5g4h3i2j1...",
        workspace_id="ws-uuid"
    )
    
    async with ErghiClient(config) as client:
        conversations = await client.chat.get_conversations()
        for conv in conversations:
            print(f"Conversation: {conv.id} - Status: {conv.status}")

asyncio.run(main())
```

---

### 3. .NET (C#)

```csharp
using Erghi.SDK;

var config = new ErghiConfig
{
    ApiUrl = "https://api.erghi.ai",
    ClientId = "cf_cl_9ab7c8e...",
    ClientSecret = "cf_sk_a2b9d8e7c6f5g4h3i2j1...",
    WorkspaceId = "ws-uuid"
};

await using var client = new ErghiClient(config);

// The client manages token acquisition and refreshing asynchronously
var conversations = await client.Chat.GetConversationsAsync();
foreach (var conv in conversations.Data)
{
    Console.WriteLine($"ID: {conv.Id}, Status: {conv.Status}");
}
```

---

### 4. Flutter / Dart

```dart
import 'package:aichat_sdk/aichat_sdk.dart';

void main() async {
  final config = AIChatConfig(
    apiUrl: 'https://api.erghi.ai',
    clientId: 'cf_cl_9ab7c8e...',
    clientSecret: 'cf_sk_a2b9d8e7c6f5g4h3i2j1...',
    workspaceId: 'ws-uuid',
  );

  final client = AIChatClient(config);

  try {
    final response = await client.chat.getConversations();
    for (var conversation in response.data) {
      print('Conversation ID: ${conversation.id}');
    }
  } catch (e) {
    print('Failed to get conversations: $e');
  }
}
```

---

### 5. Swift

```swift
import Foundation
import AIChatSDK

let config = AIChatConfig(
    apiURL: URL(string: "https://api.erghi.ai")!,
    clientId: "cf_cl_9ab7c8e...",
    clientSecret: "cf_sk_a2b9d8e7c6f5g4h3i2j1..."
)

let client = AIChatClient(config: config)

Task {
    do {
        let conversations = try await client.chat.getConversations()
        for conversation in conversations.data {
            print("Conversation ID: \(conversation.id)")
        }
    } catch {
        print("Error: \(error)")
    }
}
```

---

## Webhooks

Webhooks notify your backend of real-time events, such as when a new message is received or a conversation is closed.

### Event Payload Structure
All webhook events use a standard envelope structure:

```json
{
  "event": "message.created",
  "timestamp": "2026-06-23T08:05:00Z",
  "workspaceId": "ws-uuid",
  "data": {
    "id": "msg-uuid",
    "conversationId": "conv-uuid",
    "senderId": "visitor-uuid",
    "senderType": "visitor",
    "content": "Hi! Can you help me?",
    "createdAt": "2026-06-23T08:05:00Z"
  }
}
```

### Verifying Signatures
Erghi includes a signature in the request headers (`X-Erghi-Signature`) using HMAC-SHA256 to ensure payloads originate from our platform.

To verify a webhook signature in Node.js:
```javascript
import crypto from 'crypto';

function verifyWebhook(payload, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
    
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}
```
