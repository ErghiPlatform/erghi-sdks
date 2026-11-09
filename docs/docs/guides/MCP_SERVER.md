---
title: Set up Erghi from an AI assistant (MCP)
description: Use the Erghi MCP server to set up and run your workspace from Claude, Cursor or any MCP client, without opening the admin app.
---

# Set up Erghi from an AI assistant (MCP)

The [Erghi MCP server](https://github.com/ErghiPlatform/erghi-mcp) lets an AI assistant such as Claude Desktop, Claude Code, Cursor or VS Code set up and run your Erghi workspace for you. Describe what you want in plain language: the assistant configures the AI persona, fills the knowledge base from your website, creates and brands the chat widget, gives you the embed code, and answers conversations.

It runs on your machine as a small Docker container and signs in with a **workspace API key**, so it can only do what that key allows.

## 1. Create an API key

In the admin app, open **Settings → Agent API keys** and choose **Create key**.

1. Give the key a name, for example *Claude setup*.
2. Pick the scopes it needs. For a full setup, choose `configure_ai`, `manage_workspace_identity`, `manage_widgets` and `chat:read`, plus `manage_integrations` if the assistant should call your product's API.
3. Optionally set an expiry. A short one is a good idea for a one-off setup.
4. Copy the client ID and secret. **The secret is shown only once.**

| Scope | Lets the assistant |
|---|---|
| `chat:read` | Read conversations and messages |
| `chat:write` | Reply to and resolve conversations |
| `configure_ai` | Configure the assistant's model and persona, the knowledge base and website crawls, Telegram/Slack/WhatsApp channels and action policies |
| `manage_workspace_identity` | Set the company name, colours, widget theme and legal/support links |
| `manage_widgets` | Create, configure and deactivate chat widgets, and get the embed code |
| `manage_integrations` | Connect your product's APIs from OpenAPI documents, decide which values come from the signed-in user, write instructions for each endpoint, test and switch them on or off. Not their credentials. |
| `view_audit_logs` | Read the security and configuration audit log |
| `view_insights` | Read [conversation insights](./CONVERSATION_INSIGHTS.md) (topics, sentiment, outcomes). Erghi does not issue this scope to API keys yet, so the insight tools are not offered today |

You can only give a key permissions you have yourself. Billing, team members, API keys, integration credentials, the identity-verification secret and account deletion can never be given to a key.

## 2. Connect your MCP client

You need [Docker](https://docs.docker.com/get-docker/) installed.

### Claude Code

Replace `YOUR_CLIENT_ID` and `YOUR_CLIENT_SECRET` with the full values from step 1, then run:

```bash
claude mcp add erghi -e ERGHI_CLIENT_ID=YOUR_CLIENT_ID -e ERGHI_CLIENT_SECRET=YOUR_CLIENT_SECRET -- docker run -i --rm -e ERGHI_CLIENT_ID -e ERGHI_CLIENT_SECRET ghcr.io/erghiplatform/erghi-mcp:latest
```

Run `claude mcp list` and check that `erghi` shows **Connected**. The key is stored in Claude Code's config, which is what you need when Claude Code runs inside the desktop app: it doesn't see variables you `export` in a terminal.

### Claude Desktop, Cursor and other clients

Add this to the client's MCP configuration file (for Claude Desktop: **Settings → Developer → Edit config**):

```json
{
  "mcpServers": {
    "erghi": {
      "command": "docker",
      "args": ["run", "-i", "--rm",
               "-e", "ERGHI_CLIENT_ID", "-e", "ERGHI_CLIENT_SECRET",
               "ghcr.io/erghiplatform/erghi-mcp:latest"],
      "env": {
        "ERGHI_CLIENT_ID": "YOUR_CLIENT_ID",
        "ERGHI_CLIENT_SECRET": "YOUR_CLIENT_SECRET"
      }
    }
  }
}
```

Restart the client. Ask *"What can my Erghi key do?"* to check the connection: the assistant calls `get_api_key_info` and lists the key's scopes.

### Using Podman

Use Podman's full path as the command instead of `docker`, for example `/opt/podman/bin/podman` on macOS (`which podman` prints yours). An alias like `alias docker=podman` doesn't work, because MCP clients don't start the server through your shell.

### If it doesn't connect

| What you see | Fix |
|---|---|
| `Executable not found in $PATH: "docker"` | Use the full path to Docker (`which docker`) or Podman as the command. |
| `401 (invalid_client)`, or "Connection closed" | The client ID or secret is wrong, incomplete or still the placeholder, or the key was revoked. The secret is shown only once: if you don't have it, revoke the key and create a new one. |
| The server starts without a key | Put the key in the client's config (`-e` before `--`, or `env` in the JSON), not only in your shell. |

To see why the server stopped, run its command in a terminal with `ERGHI_CLIENT_ID` and `ERGHI_CLIENT_SECRET` set.

## 3. Finish the dashboard checklist

When you sign up, the dashboard shows a **Get your assistant live** checklist. The MCP server can work through it with you.

If your client supports MCP prompts, choose the **`setup_erghi`** prompt from its prompt menu and fill in your company, website and main language. Otherwise, paste this:

```text
Set up Erghi for [Company] (website: [https://example.com], main language: [en]) so the
"Get your assistant live" checklist on the dashboard is complete. Start with get_setup_checklist,
then work through every step that isn't done, checking with me before each change. Finish by
showing me the checklist again.
```

The assistant will:

| Step | What happens |
|---|---|
| **Assistant** | Proposes an assistant name, tone and short instructions, plus your brand colours and support/privacy/terms links, and applies them once you agree. |
| **Add knowledge** | Crawls your website, asks you about anything the site doesn't cover (pricing, shipping, refunds, opening hours) and adds it as FAQs, then tests the assistant with realistic questions. |
| **Create a widget** | Creates a widget limited to your domain, with a welcome message in your language, and gives you the embed code to paste before `</body>`. |
| **Invite a teammate** | Keys can't manage team members, so it gives you the link to invite someone in the admin app. |
| **Get your first conversation** | Once the snippet is live, you send a message through the widget. The assistant checks the checklist again and shows you how the conversation went. |

You can ask *"Show me my Erghi setup checklist"* at any time to see what's left. Steps the key's scopes can't see show as *unknown*.

## More things to ask

- *"Ask the assistant five questions a real customer would ask, tell me which answers are weak, and fix the gaps with FAQs."*
- *"Re-crawl https://example.com/help every week."*
- *"Make the widget dark, bottom-left, with our colour #0F766E, and write the offline message in Arabic and English."*
- *"List open conversations, summarise each one and draft replies. Don't send anything until I approve it."* (needs `chat:read` and `chat:write`)
- *"Connect our Telegram bot."* The assistant asks you for the bot token; it never makes up secrets.

## Plan the assistant around your product

Ask your AI client to study your product and set Erghi up around it:

> *"Analyse https://example.com and our help centre, list the questions customers ask and where each answer should come from, and propose a plan for the assistant. Don't change anything until I approve it."*

In clients that support MCP prompts, the `analyze_product` prompt does this step by step. The assistant:

1. Reads Erghi's own guide to how replies are built (`get_erghi_guide`) and reviews your current setup (`review_chat_setup`).
2. Builds a question map: each kind of customer question, whether it's answered from the knowledge base, your API, or a person, and whether Erghi covers it today.
3. Proposes persona and instructions, knowledge to add, API integrations, action policies and hand-off settings, and applies them only after you agree.
4. Tests with realistic questions, including one in each language your customers use and one that tries to get another customer's data.

### Connect your API

With `manage_integrations`, the assistant can connect an API from its OpenAPI document (the `connect_integration` prompt). It recommends which endpoints to expose and, for each one:

- **binds** every parameter that identifies the user, such as `user_id`, to `{{identity.sub}}`, the signed-in user from your app's identity token, so the model can never choose whose data it reads;
- passes the user's own access token as `{{secret.<key>}}` when your API is user-scoped (your app supplies it through the SDK, and the model never sees it);
- writes **AI instructions**: when to call the endpoint, units and formats, what to tell the visitor;
- adds **action policies**, such as a verified identity or a confirmation step before anything that changes data.

You add the API's credentials yourself under **Integrations** in the admin app. A key can't read or set them, and can't move an integration with saved credentials to another server. See [Integration tool context](https://github.com/ErghiPlatform/Erghi/blob/main/docs/INTEGRATION_TOOL_CONTEXT.md) for the details.

### Review what affects chat

*"Review my Erghi setup"* runs `review_chat_setup`. It checks persona, knowledge base, AI settings, integrations, policies and widgets and lists problems by severity, each with a fix. For example, an endpoint where the model picks the user id itself, a token stored as plain text in a binding, or an action with no policy.

More examples: [example prompts](https://github.com/ErghiPlatform/erghi-mcp/blob/main/docs/example-prompts.md).

## Safety

- **The key is the limit.** The server only offers tools the key's scopes allow, and the Erghi API checks every scope again.
- **Nothing is removed without you.** Deleting, disconnecting or deactivating something, replacing an API's spec, or testing an API call that could change data needs an explicit confirmation, and the assistant is told to ask you first.
- **Fast revocation.** Revoke the key in **Settings → Agent API keys** and the assistant loses access within about 30 seconds, including tokens it already has.
- **Audited.** Changes made through a key appear in the workspace audit log under the key's client ID.
- **Read-only mode.** Add `-e ERGHI_MCP_READ_ONLY=true` to the Docker arguments to offer only tools that change nothing.
- **Web content is data.** The assistant is told to treat website, document and conversation content as data, not instructions. That reduces prompt-injection risk but doesn't remove it, so grant only the scopes you need.

## What stays in the admin app

Billing and plan changes, inviting team members and changing roles, API keys, integration credentials, the identity-verification secret, logo upload, custom domains and account deletion. The assistant will point you to [app.erghi.ai](https://app.erghi.ai) for these.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ERGHI_CLIENT_ID` | (required) | API key client ID |
| `ERGHI_CLIENT_SECRET` | (required) | API key secret. Or use `ERGHI_CLIENT_SECRET_FILE` with a path to a file holding it. |
| `ERGHI_MCP_READ_ONLY` | `false` | `true` offers only tools that change nothing |
| `ERGHI_MCP_TRANSPORT` | `stdio` | `http` serves streamable HTTP at `/mcp` for a shared setup (requires `ERGHI_MCP_HTTP_TOKEN`) |

The full list, the HTTP mode and the complete tool reference are in the [erghi-mcp README](https://github.com/ErghiPlatform/erghi-mcp#readme).
