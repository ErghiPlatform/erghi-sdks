# API keys (client credentials)

A workspace API key lets a backend service, script or AI assistant call Erghi without a user's login. It uses the OAuth2 **client credentials** flow: you exchange a client ID and secret for a short-lived bearer token.

:::tip
To set up a workspace from Claude, Cursor or another AI assistant, you don't need to call this API yourself. Use the [Erghi MCP server](./MCP_SERVER.md).
:::

## Create a key

The easiest way is the admin app: **Settings → Agent API keys → Create key**. Copy the secret when it is shown; it isn't shown again and the server stores only a hash.

You can also use the API, signed in as a user with the **Manage integrations** permission. The key is created in that user's current workspace.

```http
POST /api/v1/auth/keys
Authorization: Bearer <user token>
Content-Type: application/json

{
  "name": "Support inbox sync",
  "scopes": ["chat:read", "chat:write"],
  "expiresInDays": 90
}
```

`201 Created`:

```json
{
  "clientId": "cf_client_live_3f1c…",
  "clientSecret": "cf_secret_live_9a7e…",
  "name": "Support inbox sync",
  "createdAt": "2026-11-02T10:00:00Z",
  "expiresAt": "2027-01-31T10:00:00Z",
  "scopes": ["chat:read", "chat:write"]
}
```

- `scopes` defaults to `["chat:read", "chat:write"]` when it's left out. An unknown scope returns `400 invalid_scope`.
- You can't give a key a scope you don't have yourself (`403 scope_exceeds_creator`).
- `expiresInDays` is optional. Without it the key never expires.

### Scopes

| Scope | Allows |
|---|---|
| `chat:read` | Read conversations and messages |
| `chat:write` | Reply to and resolve conversations |
| `configure_ai` | Assistant model and persona, knowledge base, website crawls, channels, action policies |
| `manage_workspace_identity` | Company name, colours, widget theme, legal and support links |
| `manage_widgets` | Create, configure and deactivate widgets |
| `view_audit_logs` | Read the audit log |
| `view_insights` | Read conversation insights (plan-gated; the creator must hold it) |

Billing, team members, integrations and account deletion are human-only and can't be granted to a key.

### List and revoke keys

```http
GET /api/v1/auth/keys
Authorization: Bearer <user token>
```

Returns each key's `id`, `clientId`, `name`, `createdAt`, `expiresAt`, `isActive` and `scopes`. Secrets are never returned.

```http
DELETE /api/v1/auth/keys/{id}
Authorization: Bearer <user token>
```

Returns `204 No Content`. Revocation takes effect within about 30 seconds, including tokens that were already issued.

Creating and revoking keys is recorded in the workspace audit log.

## Get a token

```http
POST /api/v1/auth/token
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "cf_client_live_3f1c…",
  "client_secret": "cf_secret_live_9a7e…"
}
```

The endpoint also accepts `application/x-www-form-urlencoded`. Response:

```json
{
  "access_token": "eyJhbGciOi…",
  "token_type": "Bearer",
  "expires_in": 7200
}
```

Send the token as `Authorization: Bearer <access_token>`. It is scoped to the key's workspace, so no workspace header is needed. Request a new one before it expires; the SDKs below do this for you.

## What a key can call

Keys are closed by default. A key can reach:

- **The MCP endpoint** (`/api/mcp`) for conversations: listing and reading them (`chat:read`), replying and resolving (`chat:write`). Any MCP client library can connect to it with the bearer token.
- **Setup endpoints opened to a scope**: branding and assistant persona, AI settings, the knowledge base and crawls, channels, action policies, widgets and the audit log. The [MCP server's source](https://github.com/ErghiPlatform/erghi-mcp/blob/main/internal/tools/catalog.go) lists the exact paths it uses.

Everything else, including the member REST endpoints such as `/api/conversations`, returns `403` to a key. Those endpoints are for signed-in users of the admin app.

Every change made through a key is checked against its scopes and recorded in the audit log under the key's client ID.

## Using the SDKs

The JavaScript, Python, .NET, Flutter and Swift SDKs accept a client ID and secret instead of a user token. They exchange them for a token, cache it and renew it automatically. For example, in JavaScript:

```typescript
import { ErghiClient } from '@erghi-ai/sdk';

const client = new ErghiClient({
  apiUrl: 'https://api.erghi.ai',
  clientId: process.env.ERGHI_CLIENT_ID,
  clientSecret: process.env.ERGHI_CLIENT_SECRET,
});
```

Only call endpoints a key can reach (see above). The SDKs' conversation methods use the member endpoints, so with a key, read and answer conversations through the MCP endpoint instead.

Keep the secret on your server. Never ship it to a browser or mobile app.
