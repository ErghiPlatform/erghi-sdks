# Erghi User Guide

> **Erghi** — Embed AI-powered live chat into your product and manage every conversation in real time.

## Table of Contents

- [What Is Erghi?](#what-is-erghi)
- [Core Concepts](#core-concepts)
- [Getting Started — Admin](#getting-started--admin)
- [Admin Portal Reference](#admin-portal-reference)
  - [Dashboard](#dashboard)
  - [Managing Users](#managing-users)
  - [Managing Widgets](#managing-widgets)
  - [Conversations View](#conversations-view)
  - [Admin Billing](#admin-billing)
- [Getting Started — End Users](#getting-started--end-users)
- [User Portal Reference](#user-portal-reference)
  - [Chat Interface](#chat-interface)
- [Embedding the Chat Widget](#embedding-the-chat-widget)
- [Billing & Plans](#billing--plans)
- [SDK Quick-Start](#sdk-quick-start)
- [FAQ](#faq)

---

## What Is Erghi?

Erghi is a multi-tenant B2B live-chat SaaS platform. It lets your business:

- Embed a fully customisable chat widget into any web page or mobile app
- Route visitor conversations to human agents or an AI assistant
- Manage all conversations in a single admin portal
- Integrate with existing workflows via webhooks and SDKs

Erghi is designed for **workspace owners** (businesses that install the widget) and their **end users** (visitors who chat through the widget). Both have dedicated portals.

---

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Workspace** | Your business's isolated tenant inside Erghi |
| **Widget** | An embeddable chat component configured per site or context |
| **Conversation** | A single chat session between a visitor and your team or AI |
| **Message** | An individual message within a conversation |
| **Agent** | A human support representative assigned to conversations |
| **Visitor** | An anonymous or identified end user who starts a chat |

---

## Getting Started — Admin

### 1. Sign Up and Create Your Workspace

1. Navigate to the Erghi Admin Portal
2. Click **Sign Up**
3. Provide your business email and set a password
4. Your workspace is provisioned automatically

### 2. Create Your First Widget

1. Log in to the Admin Portal
2. Go to **Widgets → Create Widget**
3. Configure:
   - **Name** — internal label (e.g., "Homepage Widget")
   - **Welcome message** — shown to visitors on open
   - **AI mode** — whether the AI assistant responds automatically
   - **Theme colour** — matches your brand
4. Click **Save**

The widget generates a unique `widgetId` you'll use to embed it.

### 3. Embed the Widget

Copy the embed snippet from the widget settings and paste it into your website's HTML before `</body>`:

```html
<script>
  window.ErghiConfig = { widgetId: "your-widget-id" };
</script>
<script src="https://cdn.erghi.ai/widget.js" async></script>
```

Visitors will now see the chat bubble on your site.

### 4. Invite Agents

1. Go to **Users → Invite User**
2. Enter the agent's email and assign the **Agent** role
3. They receive an invitation email to join your workspace

---

## Admin Portal Reference

### Dashboard

The admin dashboard shows workspace-wide statistics:

| Metric | Description |
|--------|-------------|
| **Total Conversations** | All conversations since account creation |
| **Active Conversations** | Conversations currently open |
| **Total Messages** | All messages sent across the workspace |
| **Today's Messages** | Messages sent in the last 24 hours |
| **Avg Response Time** | Average agent/AI first-response time in minutes |
| **Conversation Trend** | Percentage change vs. prior period |
| **Message Trend** | Percentage change vs. prior period |

---

### Managing Users

Go to **Users** to manage all agents in your workspace.

**Actions available:**
- View all workspace users with their roles and status
- Invite new users (Agents or Admins)
- Revoke access

**Roles:**

| Role | Capabilities |
|------|-------------|
| **Admin** | Full access: manage widgets, users, billing, conversations |
| **Agent** | Handle and close conversations; read-only dashboard |

---

### Managing Widgets

Go to **Widgets** to view and manage all chat widgets for your workspace.

**Per-widget settings:**

| Setting | Description |
|---------|-------------|
| **Name** | Internal label |
| **Welcome Message** | Shown when the chat opens |
| **AI Enabled** | Toggle AI assistant responses on/off |
| **Theme Colour** | Hex colour for the widget button and header |
| **Auto-Assign** | Automatically assign incoming chats to available agents |
| **Offline Message** | Shown when no agents are online |

---

### Conversations View

Go to **Conversations** to monitor all incoming and historical conversations.

**Filtering and search:**
- Filter by status: `open`, `closed`, `pending`
- Search by visitor identifier

**Conversation actions:**
- **Assign** — Assign an open conversation to a specific agent
- **Close** — Mark the conversation as resolved
- **View messages** — Read the full transcript

---

### Admin Billing

Go to **Billing** to manage your Erghi subscription.

See [Billing & Plans](#billing--plans) for full details.

---

## Getting Started — End Users

End users access Erghi through either:

1. **The embedded widget** on your website (no sign-in required)
2. **The Erghi User Portal** (for registered users with accounts in your workspace)

### Using the Embedded Widget

1. Click the chat bubble on the host website
2. Type a message and press Enter
3. An AI assistant or live agent responds
4. Continue the conversation; close the window at any time

No account is required for widget conversations.

### Using the User Portal

1. Navigate to the Erghi User Portal URL provided by your workspace admin
2. Log in with your credentials
3. The **Chat** page shows your conversation history and lets you start a new chat

---

## User Portal Reference

### Chat Interface

The chat screen provides:

| Feature | Description |
|---------|-------------|
| **Message thread** | Chronological conversation history |
| **Message input** | Type and send messages |
| **Typing indicator** | Shows when the agent or AI is composing a reply |
| **Timestamps** | Each message shows its sent time |
| **Read receipts** | Messages are marked as read once seen |

---

## Embedding the Chat Widget

### HTML Snippet (any website)

The widget reads its config from `data-*` attributes on the `<script>` tag itself (no global config object):

```html
<script
  src="https://cdn.erghi.ai/widget.js"
  data-widget-id="your-widget-id"
  data-primary-color="#6366f1"
  data-greeting="How can we help?"
  async
></script>
```

### Angular

Install the SDK:

```bash
npm install @erghi/angular
```

Provide the config via the `ERGHI_CONFIG` injection token in your app's providers (no `NgModule.forRoot`):

```typescript
// app.config.ts
import { ERGHI_CONFIG, ErghiConfig } from '@erghi/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: ERGHI_CONFIG,
      useValue: <ErghiConfig>{ apiUrl: 'https://api.erghi.com', apiKey: 'your-api-key' },
    },
  ],
};
```

Then inject the provided `AuthService`/`ChatService`/`SignalrService` where needed.

### JavaScript / TypeScript

```bash
npm install @erghi/sdk
```

```typescript
import ErghiClient from '@erghi/sdk';

const client = new ErghiClient({ apiUrl: 'https://api.erghi.com', apiKey: 'your-api-key' });
await client.auth.login({ email: 'user@example.com', password: 'password' });
```

### React (see `erghi-sdks/react` for full details)

```bash
npm install @erghi/react @erghi/sdk
```

```tsx
import { ErghiProvider, useChat } from '@erghi/react';

function App() {
  return (
    <ErghiProvider config={{ apiUrl: 'https://api.erghi.com', apiKey: 'your-api-key' }}>
      <YourChatUI />
    </ErghiProvider>
  );
}

function YourChatUI() {
  const { messages, sendMessage } = useChat();
  // build your own UI from the hook's state — this SDK does not ship a
  // pre-built <ChatWidget/> component; use the vanilla-JS widget above for that.
}
```

### Other SDKs

Full SDK documentation is available for:
- **Flutter** — `erghi-sdks/flutter/`
- **Python** — `erghi-sdks/python/`
- **.NET** — `erghi-sdks/dotnet/`
- **Swift / iOS** — `erghi-sdks/swift/`

---

## Billing & Plans

### Available Plans

| Plan | Price/mo | Agents | Conversations/mo | AI Responses |
|------|----------|--------|-----------------|--------------|
| **Free** | $0 | 1 | 100 | 0 |
| **Starter** | $29 | 3 | 1,000 | 500 |
| **Growth** | $79 | 10 | 5,000 | 2,000 |
| **Scale** | $199 | Unlimited | Unlimited | 10,000 |

### Adding Agent Seats

1. Go to **Billing → Manage Plan**
2. Click **Add Agent Seat**
3. Confirm the prorated charge

### Payment Methods

Erghi accepts:
- Credit/debit card (Stripe)
- **Paymob** — Egypt & MENA
- **Fawry** — Egypt

### Viewing Invoices

Go to **Billing → Invoices** for a downloadable history of all charges.

---

## SDK Quick-Start

All Erghi SDKs share the same interface. See `erghi-sdks/` for language-specific installation instructions and full API documentation.

**Core capabilities exposed by the embeddable widget (`window.erghiWidget` / `window.ErghiWidget`):**

| Method | Description |
|--------|-------------|
| `open()` | Programmatically open the chat window |
| `close()` | Programmatically close the chat window |
| `toggle()` | Toggle the chat window open/closed |
| `authenticate(jwtToken)` | Associate an authenticated (logged-in) visitor with the conversation |
| `identify(attributes)` | Pass custom visitor attributes for routing and AI context |
| `setContext(attributes, merge?)` | Update visitor context, optionally merging with existing context |
| `getContext()` | Read the current visitor context |
| `destroy()` | Tear down the widget instance |

The client SDKs (`@erghi/sdk`, `Erghi.SDK`, `erghi-sdk`, etc.) expose a different, resource-oriented API (`client.auth`, `client.chat`, `client.workspace`) for building custom integrations rather than embedding the pre-built widget — see the SDK-specific quick starts above.

---

## FAQ

**Can I have multiple widgets for different parts of my site?**
Yes. Create a widget per context (e.g., homepage, pricing, support) and embed each with its own `widgetId`.

**Does Erghi support file attachments?**
Attachment support depends on your plan. Starter and above allow image uploads in conversations.

**Can the AI respond in languages other than English?**
Yes. The AI model auto-detects the visitor's language and responds accordingly.

**How do I connect my own AI model?**
Enterprise plans support custom LLM connections via the Erghi AI service configuration. Contact support for setup assistance.

**What happens when no agents are online?**
The widget shows your configured offline message and queues the conversation for the next available agent. Visitors can also leave their email for an asynchronous follow-up.

**Is end-to-end encryption supported?**
All traffic is encrypted in transit via TLS. Message content is stored encrypted at rest. Contact support for compliance-specific requirements.
