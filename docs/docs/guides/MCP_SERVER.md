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
2. Pick the scopes it needs. For a full setup, choose `configure_ai`, `manage_workspace_identity`, `manage_widgets` and `chat:read`.
3. Optionally set an expiry. A short one is a good idea for a one-off setup.
4. Copy the client ID and secret. **The secret is shown only once.**

| Scope | Lets the assistant |
|---|---|
| `chat:read` | Read conversations and messages |
| `chat:write` | Reply to and resolve conversations |
| `configure_ai` | Configure the assistant's model and persona, the knowledge base and website crawls, Telegram/Slack/WhatsApp channels and action policies |
| `manage_workspace_identity` | Set the company name, colours, widget theme and legal/support links |
| `manage_widgets` | Create, configure and deactivate chat widgets, and get the embed code |
| `view_audit_logs` | Read the security and configuration audit log |

You can only give a key permissions you have yourself. Billing, team members, integrations and account deletion can never be given to a key.

## 2. Connect your MCP client

You need [Docker](https://docs.docker.com/get-docker/) installed.

### Claude Code

Export the key in your shell, then add the server:

```bash
export ERGHI_CLIENT_ID="cf_client_live_…"
export ERGHI_CLIENT_SECRET="…"
claude mcp add erghi -- docker run -i --rm -e ERGHI_CLIENT_ID -e ERGHI_CLIENT_SECRET ghcr.io/erghiplatform/erghi-mcp:latest
```

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
        "ERGHI_CLIENT_ID": "cf_client_live_…",
        "ERGHI_CLIENT_SECRET": "…"
      }
    }
  }
}
```

Restart the client. Ask *"What can my Erghi key do?"* to check the connection: the assistant calls `get_api_key_info` and lists the key's scopes.

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

More examples: [example prompts](https://github.com/ErghiPlatform/erghi-mcp/blob/main/docs/example-prompts.md).

## Safety

- **The key is the limit.** The server only offers tools the key's scopes allow, and the Erghi API checks every scope again.
- **Nothing is removed without you.** Deleting, disconnecting or deactivating something needs an explicit confirmation, and the assistant is told to ask you first.
- **Fast revocation.** Revoke the key in **Settings → Agent API keys** and the assistant loses access within about 30 seconds, including tokens it already has.
- **Audited.** Changes made through a key appear in the workspace audit log under the key's client ID.
- **Read-only mode.** Add `-e ERGHI_MCP_READ_ONLY=true` to the Docker arguments to offer only tools that change nothing.
- **Web content is data.** The assistant is told to treat website, document and conversation content as data, not instructions. That reduces prompt-injection risk but doesn't remove it, so grant only the scopes you need.

## What stays in the admin app

Billing and plan changes, inviting team members and changing roles, OpenAPI integrations, logo upload, custom domains and account deletion. The assistant will point you to [app.erghi.ai](https://app.erghi.ai) for these.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ERGHI_CLIENT_ID` | (required) | API key client ID |
| `ERGHI_CLIENT_SECRET` | (required) | API key secret. Or use `ERGHI_CLIENT_SECRET_FILE` with a path to a file holding it. |
| `ERGHI_MCP_READ_ONLY` | `false` | `true` offers only tools that change nothing |
| `ERGHI_MCP_TRANSPORT` | `stdio` | `http` serves streamable HTTP at `/mcp` for a shared setup (requires `ERGHI_MCP_HTTP_TOKEN`) |

The full list, the HTTP mode and the complete tool reference are in the [erghi-mcp README](https://github.com/ErghiPlatform/erghi-mcp#readme).
