---
sidebar_position: 1
---

# Introduction

Welcome to the **Erghi SDK Documentation**.

Erghi provides a suite of SDKs that allow you to integrate real-time chat, AI assistants, and customer support directly into your applications. We offer official SDKs for the following platforms:

- **JavaScript/TypeScript** — [published on npm](https://www.npmjs.com/package/@erghi-ai/sdk)
- **React** — [published on npm](https://www.npmjs.com/package/@erghi-ai/react)
- **Angular** — source available, not yet published to npm
- **Python** — [published on PyPI](https://pypi.org/project/erghi-sdk/)
- **.NET (C#)** — [published on NuGet](https://www.nuget.org/packages/Erghi.SDK)
- **Flutter** — [published on pub.dev](https://pub.dev/packages/erghi_sdk)
- **Swift** — [published via Swift Package Manager](https://github.com/ErghiPlatform/erghi-sdk-swift)
- **Web Widget** — a plain `<script>` embed, no package install needed — see the [User Guide](./USER_GUIDE.md#embedding-the-chat-widget)

New here? Start with the [**User Guide**](./USER_GUIDE.md) for the full sign-up-to-live-widget walkthrough before diving into a specific SDK.

## Key Features
- **Real-time Messaging**: Powered by SignalR under the hood, but abstracted into easy-to-use event streams in every language.
- **AI Integration**: Chat directly with your Erghi AI agent.
- **Multi-Tenant Support**: Manage isolated environments securely using `X-Workspace-Id` and `X-Account-Id`.
- **Machine-to-Machine (M2M) Auth**: Securely connect backend systems to Erghi without user credentials.
