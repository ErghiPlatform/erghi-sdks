---
sidebar_position: 2
title: User Guide
---

# Erghi User Guide

> **Erghi** — Embed AI-powered live chat into your product and manage every conversation in real time.

Everything in this guide reflects the current live product (verified 2026-08-31), not an aspirational roadmap. Where something isn't available yet, it's called out explicitly rather than glossed over.

## Table of Contents

- [What Is Erghi?](#what-is-erghi)
- [Core Concepts](#core-concepts)
- [Getting Started — From Sign-Up to a Live Widget](#getting-started--from-sign-up-to-a-live-widget)
- [Admin Portal Reference](#admin-portal-reference)
- [Embedding the Chat Widget](#embedding-the-chat-widget)
- [Getting Started — End Users](#getting-started--end-users)
- [Billing & Plans](#billing--plans)
- [SDK Quick-Start](#sdk-quick-start)
- [FAQ](#faq)

---

## What Is Erghi?

Erghi is a multi-tenant B2B live-chat SaaS platform. It lets your business:

- Embed a fully customisable chat widget into any web page
- Route visitor conversations to human agents or an AI assistant
- Manage all conversations in a single admin portal, in **English or Arabic (full RTL)**
- Integrate with existing workflows via SDKs in 7 languages

Erghi is designed for **workspace owners** (businesses that install the widget) and their **visitors** (the people who chat through it).

---

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Workspace** | Your business's isolated tenant inside Erghi — everything below belongs to exactly one workspace |
| **Widget** | An embeddable chat component, configured per site or page context |
| **Conversation** | A single chat session between a visitor and your team or AI |
| **Agent** | A human support representative assigned to conversations |
| **Visitor** | An anonymous or identified end user who starts a chat through the widget |

---

## Getting Started — From Sign-Up to a Live Widget

This is the real, current flow — four steps, no step skipped or renamed from what you'll actually see.

![Getting started flow: create workspace, sign in, choose a plan, embed the widget](/img/getting-started-flow.svg)

### 1. Create your workspace

Click **Start free** on [erghi.ai](https://erghi.ai), or go directly to the registration page. You'll provide:

- Workspace name
- Your work email
- A password

No card is required at this step — the Free plan is available immediately.

### 2. Sign in

After registering, sign in. **Your first login lands you on Billing & Plans, not the dashboard** — this is deliberate, so you pick a plan (or explicitly stay on Free) before anything else.

### 3. Choose a plan

- **Staying on Free** — do nothing; the Free plan is your default and you can use the workspace immediately.
- **Upgrading** — clicking **Upgrade to Starter** or **Upgrade to Growth** opens a real Stripe Checkout page for that plan's price. Complete payment there; you're returned to the admin portal once it succeeds.
- **Enterprise** — has no self-serve checkout. Use the "Contact sales" form on the same page.

See [Billing & Plans](#billing--plans) below for what each plan actually includes.

### 4. Embed the widget on your site

From the sidebar, go to **Widgets → your widget → Embed** to get your real, workspace-specific snippet. It looks like this (see [Embedding the Chat Widget](#embedding-the-chat-widget) for every option):

```html
<script
  src="https://chat.staging.erghi.ai/widget.js"
  data-widget-id="your-widget-id"
  async
></script>
```

Paste it into your site's HTML just before `</body>`. The chat bubble appears immediately — no build step, no npm install required for a plain HTML site.

:::note Why "staging" in the URL?
The platform is mid soft-launch: `staging.` is currently the only live prefix for every Erghi subdomain, not a separate sandbox — this is the real, production widget host today. It moves to `chat.erghi.ai` once the prefix is dropped platform-wide; your embed snippet will be updated automatically from your widget settings when that happens, so nothing you do now needs to change later.
:::

### 5. Invite your team

Go to **Users → Invite User**, enter their email, and assign a role (**Agent** or **Admin** — see [roles](#managing-users) below). They receive an invitation email to join your workspace.

---

## Admin Portal Reference

### Dashboard

The admin dashboard (`/dashboard`) shows workspace-wide stats: total and active conversations, total and today's messages, average first-response time, and trend deltas versus the prior period.

### Managing Users

Go to **Users** to manage everyone in your workspace.

| Role | Capabilities |
|------|-------------|
| **Owner** | Everything — the account creator; every workspace has exactly one |
| **Admin** | Manage widgets, users, billing, integrations, AI settings, conversations |
| **Agent** | Handle and close conversations; read-only on everything else |

### Managing Widgets

Go to **Widgets** to view and manage every chat widget in your workspace. Per-widget settings: name, welcome message, AI-assistant toggle, theme colour, auto-assign to available agents, and an offline message shown when no one's online.

### API Integrations

Go to **API Integrations** to connect your own APIs so the AI assistant can call them as tools during a conversation (upload an OpenAPI spec, save credentials, send test requests). This surface is permission-gated to workspace admins/owners.

### Conversations View

Go to **Conversations** to monitor everything, live and historical. Filter by status (`open`/`closed`/`pending`) or search by visitor identifier. Per-conversation actions: assign to an agent, close, or read the full transcript.

### Admin Billing

Go to **Billing** to manage your subscription — see [Billing & Plans](#billing--plans).

---

## Embedding the Chat Widget

The widget reads its configuration **only** from `data-*` attributes on its own `<script>` tag — there is no separate global config object to set up.

```html
<script
  src="https://chat.staging.erghi.ai/widget.js"
  data-widget-id="your-widget-id"
  data-primary-color="#6366f1"
  data-greeting="How can we help?"
  async
></script>
```

| Attribute | Required | Description |
|---|---|---|
| `data-widget-id` | Yes | Your widget's unique ID, from Widgets → your widget → Embed |
| `data-primary-color` | No | Hex colour for the bubble/header, overrides the widget's saved theme |
| `data-greeting` | No | First message shown when a visitor opens the chat |

### Controlling the widget from your own JavaScript

Once loaded, the widget exposes itself on `window.ErghiWidget`:

| Method | Description |
|--------|-------------|
| `open()` | Programmatically open the chat window |
| `close()` | Programmatically close the chat window |
| `toggle()` | Toggle open/closed |
| `authenticate(jwtToken)` | Associate an authenticated (logged-in) visitor with the conversation |
| `identify(attributes)` | Pass custom visitor attributes for routing and AI context |
| `setContext(attributes, merge?)` | Update visitor context, optionally merging with what's already set |
| `getContext()` | Read the current visitor context |
| `destroy()` | Tear down the widget instance |

### Framework-specific SDKs

If you're building a custom chat UI instead of using the pre-built widget bubble, use one of the client SDKs below — see [SDK Quick-Start](#sdk-quick-start).

---

## Getting Started — End Users

Visitors reach Erghi two ways:

1. **The embedded widget** on your website — no account needed
2. **The Erghi user portal** — for people with an actual account in your workspace

### Using the embedded widget

Click the chat bubble, type a message, press Enter. An AI assistant or a live agent responds. No account required.

### Using the user portal

Navigate to the portal URL your workspace admin gave you, log in, and use the **Chat** page to see conversation history and start new chats.

---

## Billing & Plans

### Available plans

| Plan | Price/mo | Agents | Widgets | Conversations/mo | AI Replies/mo | History |
|------|----------|--------|---------|-------------------|-----------------|---------|
| **Free** | $0 | 1 | 1 | 50 | 100 | 7 days |
| **Starter** | $39 | 3 | 3 | 1,000 | 2,000 | 30 days |
| **Growth** | $89 | 10 | 10 | 5,000 | 8,000 | 90 days |
| **Enterprise** | Custom | Unlimited | Unlimited | Unlimited | Unlimited | 365 days |

Annual billing is available on every paid plan at a discount, selectable on the Billing & Plans page before checkout.

### Adding extra agent seats

Beyond a plan's included agent count, extra seats can be added from **Billing → Manage seats** ($15/mo on Starter, $12/mo on Growth) — billed on top of your plan through the same Stripe subscription.

### Payment methods

Erghi currently accepts **credit/debit card via Stripe**. Additional regional payment methods are planned but not yet available — if a payment method other than card is shown anywhere in the product, it is not yet live; use card for now.

### Viewing invoices

Go to **Billing → Invoices** for a downloadable history of all charges.

---

## SDK Quick-Start

All Erghi client SDKs share the same underlying resource-oriented API (`client.auth`, `client.chat`, `client.workspace`, ...) for building a fully custom integration. If you just want the pre-built chat bubble, use the [plain HTML embed](#embedding-the-chat-widget) instead — none of these SDKs ship a drop-in `<ChatWidget/>` component.

| Language | Package | Registry | Status |
|---|---|---|---|
| JavaScript / TypeScript | `@erghi-ai/sdk` | [npm](https://www.npmjs.com/package/@erghi-ai/sdk) | ✅ Published |
| React | `@erghi-ai/react` | [npm](https://www.npmjs.com/package/@erghi-ai/react) | ✅ Published |
| Angular | `@erghi-ai/angular` | npm | 🚧 Not yet published — see the [Angular SDK source](https://github.com/ErghiPlatform/erghi-sdks/tree/main/angular) to build from source in the meantime |
| Python | `erghi-sdk` | [PyPI](https://pypi.org/project/erghi-sdk/) | ✅ Published |
| .NET | `Erghi.SDK` | [NuGet](https://www.nuget.org/packages/Erghi.SDK) | ✅ Published |
| Flutter | `erghi_sdk` | [pub.dev](https://pub.dev/packages/erghi_sdk) | ✅ Published |
| Swift | `ErghiSDK` | [SPM](https://github.com/ErghiPlatform/erghi-sdk-swift) | ✅ Published |

### JavaScript / TypeScript

```bash
npm install @erghi-ai/sdk
```

```typescript
import ErghiClient from '@erghi-ai/sdk';

const client = new ErghiClient({ apiUrl: 'https://api.staging.erghi.ai', apiKey: 'your-api-key' });
await client.auth.login({ email: 'user@example.com', password: 'password' });
```

### React

```bash
npm install @erghi-ai/react @erghi-ai/sdk
```

```tsx
import { ErghiProvider, useChat } from '@erghi-ai/react';

function App() {
  return (
    <ErghiProvider config={{ apiUrl: 'https://api.staging.erghi.ai', apiKey: 'your-api-key' }}>
      <YourChatUI />
    </ErghiProvider>
  );
}

function YourChatUI() {
  const { messages, sendMessage } = useChat();
  // Build your own UI from the hook's state.
}
```

### Angular

Not yet published to npm. Build from source until it is:

```bash
git clone https://github.com/ErghiPlatform/erghi-sdks.git
cd erghi-sdks/angular && npm install && npm run build
```

Then provide config via the `ERGHI_CONFIG` injection token (no `NgModule.forRoot`):

```typescript
// app.config.ts
import { ERGHI_CONFIG, ErghiConfig } from '@erghi-ai/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: ERGHI_CONFIG, useValue: <ErghiConfig>{ apiUrl: 'https://api.staging.erghi.ai', apiKey: 'your-api-key' } },
  ],
};
```

### Python

```bash
pip install erghi-sdk
```

See the [Python SDK reference](https://github.com/ErghiPlatform/erghi-sdks/tree/main/python) for the full client API.

### .NET

```bash
dotnet add package Erghi.SDK
```

See the [.NET SDK reference](https://github.com/ErghiPlatform/erghi-sdks/tree/main/dotnet) for the full client API.

### Flutter

```yaml
dependencies:
  erghi_sdk: ^1.0.0
```

See the [Flutter SDK reference](https://github.com/ErghiPlatform/erghi-sdks/tree/main/flutter) for the full client API.

### Swift / iOS

```swift
.package(url: "https://github.com/ErghiPlatform/erghi-sdk-swift.git", from: "1.0.0")
```

See the [Swift SDK reference](https://github.com/ErghiPlatform/erghi-sdks/tree/main/swift) for the full client API.

---

## FAQ

**Can I have multiple widgets for different parts of my site?**
Yes. Create a widget per context (homepage, pricing, support) and embed each with its own `data-widget-id`.

**Does Erghi support Arabic?**
Yes — the admin portal and the widget both fully support Arabic with right-to-left layout, and the AI assistant auto-detects and replies in the visitor's language.

**Does Erghi support file attachments?**
Attachment support depends on your plan.

**How do I connect my own AI model?**
Enterprise plans support custom LLM connections. Contact sales for setup.

**What happens when no agents are online?**
The widget shows your configured offline message and queues the conversation. The AI assistant can still respond if enabled on that widget.

**Is my data encrypted?**
All traffic is encrypted in transit via TLS, and message content is encrypted at rest. Contact sales for compliance-specific requirements.
