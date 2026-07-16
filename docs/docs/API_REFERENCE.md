# Erghi API Reference

> **Gateway Base URL** (production): `https://api.erghi.ai`  
> **Gateway Base URL** (local dev): `http://localhost:5080`  
> **Conversation API** (direct, dev only): `http://localhost:5002`  
> **Content-Type**: `application/json`

All production API traffic routes through the **Gateway API** (`localhost:5080`), which validates JWTs, enforces rate limits, and proxies requests to downstream services.

## Authentication

Endpoints marked **Auth Required** need a Bearer JWT token issued by GoTrue or generated via the Client Credentials flow.

```http
Authorization: Bearer <your-jwt-token>
```

### User Authentication (GoTrue)
Obtain a token for a user:

```http
POST /auth/v1/token?grant_type=password
Content-Type: application/json

{
  "email": "agent@company.com",
  "password": "your-password"
}
```

### Machine-to-Machine Authentication (M2M)
Obtain a token for a backend service or SDK using Client Credentials:

```http
POST /api/v1/auth/token
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "your-client-id",
  "client_secret": "your-client-secret"
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

### Client Credentials Management
Admins can manage M2M keys via the API:

* **POST `/api/v1/auth/keys`** - Generate a new Client ID and Client Secret pair.
* **GET `/api/v1/auth/keys`** - List active client credentials for a workspace.
* **DELETE `/api/v1/auth/keys/{id}`** - Revoke a credential pair.

Widget-initiated requests (creating conversations, sending messages) do **not** require a JWT — they authenticate with a `widgetId`.

### Rate Limiting

| Scope | Limit |
|-------|-------|
| Authenticated users | 100 requests / minute |
| Widget endpoints | 60 requests / minute per IP |

When exceeded: `HTTP 429 Too Many Requests` with `Retry-After` header.

---

## Conversations

### POST /api/conversations — Widget Auth

Start a new conversation. Called by the embedded widget when a visitor sends their first message.

**Request body**
```json
{
  "widgetId": "widget-uuid",
  "visitorId": "visitor-uuid-or-null",
  "metadata": {
    "page": "/pricing",
    "referrer": "google.com",
    "userId": "optional-authenticated-user-id"
  }
}
```

**Response `201 Created`**
```json
{
  "id": "conv-uuid",
  "workspaceId": "ws-uuid",
  "widgetId": "widget-uuid",
  "visitorId": "visitor-uuid",
  "assignedAgentId": null,
  "status": "open",
  "channel": "widget",
  "startedAt": "2025-01-15T10:30:00Z",
  "closedAt": null,
  "metadata": {
    "page": "/pricing"
  }
}
```

---

### GET /api/conversations — Auth Required

List all conversations in the authenticated workspace (agents and admins).

**Query parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Results per page |
| `status` | string | — | Filter: `open`, `closed`, `pending` |
| `search` | string | — | Search by visitor ID |

**Response `200 OK`** — Paginated list of conversation objects

---

### GET `/api/conversations/{id}` — Public

Get a conversation by ID. Used by the widget to resume a session.

**Response `200 OK`** — Full conversation object

---

### POST `/api/conversations/{id}/close` — Auth Required

Close a conversation and mark it as resolved.

**Response `200 OK`** — Updated conversation with `status: "closed"` and `closedAt` timestamp

---

### POST `/api/conversations/{id}/assign` — Auth Required

Assign a conversation to a specific agent.

**Request body**
```json
{
  "agentId": "agent-user-uuid"
}
```

**Response `200 OK`** — Updated conversation with `assignedAgentId` set

---

## Messages

### POST `/api/conversations/{id}/messages` — Public / Auth Required

Send a message in a conversation. Called by both visitors (no auth) and agents (auth required).

**Request body**
```json
{
  "content": "Hello, I have a question about your pricing.",
  "senderType": "visitor",
  "senderId": "visitor-uuid-or-agent-uuid"
}
```

**`senderType` values**: `visitor`, `agent`, `ai`

**Response `201 Created`**
```json
{
  "id": "msg-uuid",
  "conversationId": "conv-uuid",
  "content": "Hello, I have a question about your pricing.",
  "senderType": "visitor",
  "senderId": "visitor-uuid",
  "isRead": false,
  "createdAt": "2025-01-15T10:30:05Z"
}
```

---

### GET `/api/conversations/{id}/messages` — Public

Get all messages in a conversation (paginated, chronological).

**Query parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 50 | Messages per page |

**Response `200 OK`**
```json
{
  "data": [
    {
      "id": "msg-uuid",
      "conversationId": "conv-uuid",
      "content": "Hello!",
      "senderType": "visitor",
      "senderId": "visitor-uuid",
      "isRead": true,
      "createdAt": "2025-01-15T10:30:05Z"
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 50
}
```

---

### POST `/api/conversations/{conversationId}/messages/{messageId}/read` — Auth Required

Mark a specific message as read (for read receipt tracking).

**Response `200 OK`** — Updated message with `isRead: true`

---

## Widgets

### POST /api/widgets — Auth Required (Admin)

Create a new chat widget for the workspace.

**Request body**
```json
{
  "name": "Homepage Widget",
  "welcomeMessage": "Hi! How can we help you today?",
  "aiEnabled": true,
  "themeColor": "#6366f1",
  "autoAssign": true,
  "offlineMessage": "We're offline right now. Leave a message and we'll respond ASAP."
}
```

**Response `201 Created`**
```json
{
  "id": "widget-uuid",
  "workspaceId": "ws-uuid",
  "name": "Homepage Widget",
  "welcomeMessage": "Hi! How can we help you today?",
  "aiEnabled": true,
  "themeColor": "#6366f1",
  "autoAssign": true,
  "offlineMessage": "We're offline right now...",
  "embedCode": "<script>window.ErghiConfig={widgetId:'widget-uuid'};</script><script src='https://cdn.erghi.ai/widget.js' async></script>",
  "createdAt": "2025-01-15T09:00:00Z"
}
```

---

### GET /api/widgets — Auth Required

List all widgets in the workspace.

**Response `200 OK`** — Array of widget objects

---

### GET `/api/widgets/{id}` — Auth Required

Get a single widget's configuration.

**Response `200 OK`** — Full widget object

---

### PUT `/api/widgets/{id}` — Auth Required (Admin)

Update widget settings.

**Request body** — Same structure as POST; include only fields you want to change

**Response `200 OK`** — Updated widget object

---

## Admin Endpoints

All `/api/admin/` endpoints require the **Admin** role.

### GET /api/admin/conversations/stats

Workspace-wide conversation statistics.

**Response `200 OK`**
```json
{
  "totalConversations": 524,
  "activeConversations": 18,
  "todayConversations": 42,
  "avgConversationDuration": 8.3,
  "conversationTrend": 12.5
}
```

---

### GET /api/admin/messages/stats

Message statistics for the workspace.

**Response `200 OK`**
```json
{
  "totalMessages": 3205,
  "todayMessages": 142,
  "avgResponseTime": 1.8,
  "messageTrend": 8.3
}
```

---

### GET /api/admin/conversations

List all workspace conversations with advanced filtering.

**Query parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number |
| `limit` | integer | Results per page |
| `status` | string | `open`, `closed`, `pending` |
| `search` | string | Search by visitor ID |
| `agentId` | UUID | Filter by assigned agent |
| `widgetId` | UUID | Filter by widget |

**Response `200 OK`** — Paginated conversation list

---

### GET /api/admin/widgets/stats

Aggregated statistics per widget.

**Response `200 OK`**
```json
{
  "totalWidgets": 4,
  "activeWidgets": 3,
  "widgets": [
    {
      "widgetId": "widget-uuid",
      "name": "Homepage",
      "conversationsToday": 18,
      "avgResponseTime": 2.1
    }
  ]
}
```

---

### GET /api/admin/widgets

List all workspace widgets (admin view with usage stats).

---

### POST /api/admin/widgets

Admin-level widget creation (same as `POST /api/widgets` with additional fields available).

---

## Billing

### GET /api/v1/billing/plans — Public

List available Erghi subscription plans.

**Response `200 OK`**
```json
[
  {
    "id": "plan-free",
    "name": "Free",
    "monthlyPrice": 0,
    "annualPrice": 0,
    "maxAgents": 1,
    "maxConversations": 100,
    "maxAiResponses": 0
  },
  {
    "id": "plan-starter",
    "name": "Starter",
    "monthlyPrice": 29,
    "annualPrice": 278,
    "maxAgents": 3,
    "maxConversations": 1000,
    "maxAiResponses": 500
  }
]
```

---

### GET /api/v1/billing/current — Auth Required

Get the current workspace plan and usage.

**Response `200 OK`**
```json
{
  "planId": "plan-starter",
  "planName": "Starter",
  "agentsUsed": 2,
  "agentsLimit": 3,
  "conversationsUsed": 412,
  "conversationsLimit": 1000,
  "aiResponsesUsed": 87,
  "aiResponsesLimit": 500,
  "billingPeriodStart": "2025-01-01",
  "billingPeriodEnd": "2025-01-31"
}
```

---

### POST /api/v1/billing/checkout — Auth Required

Create a Stripe checkout session.

**Request body**
```json
{
  "planId": "plan-growth",
  "interval": "monthly"
}
```

**Response `200 OK`**
```json
{
  "checkoutUrl": "https://checkout.stripe.com/pay/cs_..."
}
```

---

### POST /api/v1/billing/portal — Auth Required

Create a Stripe customer portal session.

**Response `200 OK`**
```json
{
  "portalUrl": "https://billing.stripe.com/session/..."
}
```

---

### POST /api/v1/billing/add-agent — Auth Required (Admin)

Add an additional agent seat to the current plan (billed prorated).

**Response `200 OK`** — Updated usage object

---

### DELETE /api/v1/billing/remove-agent — Auth Required (Admin)

Remove an agent seat from the plan.

---

### GET /api/v1/billing/invoices — Auth Required

Get invoice history for the workspace.

**Response `200 OK`** — Array of invoice objects with amount, date, and PDF URL

---

### POST /api/v1/billing/checkout/paymob — Auth Required

Initiate a Paymob payment (Egypt/MENA).

**Request body** — `planId`, `interval`

---

### POST /api/v1/billing/checkout/fawry — Auth Required

Initiate a Fawry payment (Egypt).

---

## Real-Time: WebSocket / SignalR

Erghi uses **SignalR** for real-time message delivery. Connect to the hub:

```
wss://api.erghi.ai/hubs/chat?conversationId=<conv-id>&token=<jwt>
```

**Events received from server:**

| Event | Payload | Description |
|-------|---------|-------------|
| `ReceiveMessage` | message object | New message in the conversation |
| `AgentAssigned` | `{ agentId, agentName }` | Conversation assigned to an agent |
| `ConversationClosed` | `{ conversationId }` | Conversation was closed |
| `TypingStarted` | `{ senderId, senderType }` | Sender is typing |
| `TypingStopped` | `{ senderId }` | Sender stopped typing |

**Events sent to server:**

| Method | Parameters | Description |
|--------|-----------|-------------|
| `JoinConversation` | `conversationId` | Subscribe to a conversation's events |
| `LeaveConversation` | `conversationId` | Unsubscribe |
| `TypingStart` | `conversationId` | Notify others you're typing |
| `TypingStop` | `conversationId` | Notify others you stopped |

---

## Errors

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Bad Request",
  "status": 400,
  "detail": "widgetId is required",
  "traceId": "00-abc123-def456-00"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Validation error |
| 401 | Missing or invalid token |
| 403 | Insufficient role (e.g., agent accessing admin route) |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Internal error |
