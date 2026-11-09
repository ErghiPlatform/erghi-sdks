---
title: Conversation Insights
description: What Erghi records about each finished conversation (topic, category, sentiment, outcome), how it is produced, who can read it and the limits of the API.
---

# Conversation Insights

Conversation Insights answers three questions about your support chats: what are customers asking
about, how do they feel, and did the AI solve it. For each finished conversation Erghi stores one
short record, and the [Insights API](../API_REFERENCE.md#insights) lets you read the records, the
totals and a CSV export.

> **Status.** The API is live. The classifier that writes the records is **off by default** and is
> switched on by Erghi for a deployment (the `CONVERSATION_INSIGHTS_ENABLED` deploy setting), not by
> you in the admin app. Until it is on, the API answers normally but returns zero conversations. What
> you can read depends on your plan: see [Plans](#plans).

## What is recorded

One record per conversation, written after it is closed or resolved and has been quiet for a few
minutes.

| Field | Values |
|---|---|
| `topic` | A short label (two to five words) for what the visitor wanted |
| `category` | One of `billing`, `account`, `technical`, `complaint`, `product question`, `other`. The list is fixed today; per-workspace categories are not available yet |
| `sentiment` | `Positive`, `Neutral` or `Negative` over the whole conversation |
| `sentimentEnd` | The same scale, for how the conversation ended |
| `outcome` | `ResolvedByAi`, `ResolvedByAgent`, `HandedOffUnresolved`, `Abandoned` or `SpamOrEmpty` |
| `language` | BCP 47 tag of the visitor's language, such as `en`, `ar-EG` or `pt-BR` |
| `summary` | One or two sentences describing the conversation |
| `confidence` | 0 to 1, how sure the classifier is |
| `classifiedAt` | When the record was written |
| `stale` | `true` when the conversation was reopened after the record was written |

Classification is language-agnostic: the visitor can write in any language or dialect, in Latin
letters for a non-Latin language, or mix languages. Erghi uses no keyword lists per language. The
`topic` and `summary` are written in the visitor's language, so a workspace with Arabic and English
visitors gets labels in both; group by `category` for a single-language view.

The AI-resolved rate in the summary is the share of `ResolvedByAi` among all conversations that
needed a reply. `SpamOrEmpty` conversations are left out of that rate, and it is `null` when there
is nothing to rate.

## How it works

1. A background sweep runs about every 2 minutes, but only when the feature is enabled for the
   deployment, and only for workspaces on a **paid plan** (Starter, Growth or Enterprise, including a
   trial of a paid plan) whose subscription is not suspended or cancelled. Free workspaces are never
   classified, and a plan change takes effect on the next sweep. It picks conversations that are resolved or closed, have been quiet for 5 minutes,
   were last active in the past 14 days and have no record yet (or were reopened and closed again).
   Turning the feature on therefore never classifies older history.
2. Erghi already knows some facts for certain: whether the conversation was handed off, whether a
   human replied and how it ended. The outcome comes from those facts wherever they settle it.
   The model decides only the ambiguous cases, such as a visitor who stopped replying after the
   AI answered.
3. The model sees the conversation summary and up to the 50 most recent messages and returns the
   fields above. A conversation with no visitor message needs no model call and is recorded as
   `SpamOrEmpty`.
4. Each classification is a model call on the `classify` model tier, which is `gpt-oss-120b` on the
   default providers (Groq `openai/gpt-oss-120b`, Bedrock `openai.gpt-oss-120b-1:0`). It counts toward the workspace's
   monthly AI spend cap like any other call. At the cap, classification pauses and resumes after
   the cap resets.

A failed classification is retried after an hour. A reopened conversation keeps its old record,
marked `stale`, until it closes again and is reclassified.

## Plans

What the API returns is decided server side from your workspace's plan; nothing in the request can
widen it.

| | Free | Starter | Growth | Enterprise |
|---|---|---|---|---|
| Read the API | No: `403` `plan_upgrade_required` | Yes | Yes | Yes |
| Outcomes, AI-resolved rate, sentiment | | Yes | Yes | Yes |
| Topics, categories, languages | | Withheld (`locked`) | Yes | Yes |
| `topic`, `category`, `language`, `summary`, `confidence` on each conversation | | `null` | Yes | Yes |
| Filtering by `category`, `topic` or `minConfidence` | | `403` | Yes | Yes |
| CSV export | | `403` | Yes | Yes |
| Window | | 30 days | 90 days (your plan's history retention) | 365 days (your plan's history retention) |

A request that needs a higher plan returns `403` with
`{ "error": "...", "code": "plan_upgrade_required", "plan": "Starter", "requiredPlan": "Growth" }`
(`requiredPlan` is `Starter` when the workspace is on Free).

The window is clamped on the server: a `from` earlier than the window start is raised to it, and
every response reports the plan, what is locked and the effective window:

| Field | Meaning |
|---|---|
| `plan` | The plan the response was computed for |
| `locked` | Fields withheld on this plan: `["topics", "categories", "languages"]` on Starter, empty otherwise |
| `lockedCounts` | Summary only. On Starter, the number of distinct `topics` and `categories` found in the plan window, so a UI can say "14 topics found" without revealing them. Always computed over the whole window, not your filters. Empty on Growth and Enterprise |
| `windowDays` | Length of the plan's window in days |
| `from` | The effective start of the window after clamping |

On Starter the summary returns `topics`, `categories` and `languages` as `null`.

## Who can read it

Reading needs the workspace permission **`view_insights`**, which the Owner and Admin roles have.
Other roles get `403`.

A workspace API key can hold `view_insights` too: tick **View insights** when you create the key
in **Agent keys** (the creator must hold the permission themselves). A key without it gets `403`.
The same applies to the SDK `insights` methods and to the `get_insights_summary` and
`list_insight_conversations` tools of the [MCP server](./MCP_SERVER.md), which only appear for a
key that holds the scope. On Growth and Enterprise the key can also export the CSV, which includes
conversation summaries, so keep it secret.

Every request is scoped to the workspace in the token. You cannot read another workspace's
records.

## Limits

| | |
|---|---|
| Page size | 1 to 100 (default 25); larger values are lowered to 100 |
| CSV export | The newest 10,000 matching rows; narrow the date range to get older ones |
| Summary topics | The 20 most frequent |
| Filters | `from`, `to`, `channel`, `category`, `topic`, `sentiment`, `outcome`, `minConfidence` |
| Date filter | Applies to `classifiedAt`, not to when the conversation started |
| Bad filter | `400` with `code: "invalid_filter"` |

`from` is inclusive and `to` is exclusive. Category and topic match the exact stored text. There is
no merging of near-duplicate topics yet, so "card declined" and "payment refused" count separately.

## CSV export

`GET /api/v1/insights/export.csv` returns UTF-8 with a byte-order mark, so Excel opens Arabic and
other non-Latin text correctly. Columns:

```
conversation_id,classified_at,topic,category,sentiment,sentiment_end,outcome,language,confidence,summary
```

Lines end in CRLF and text fields are always quoted. Because summaries come from what customers
typed, any text field that begins with `=`, `+`, `-`, `@`, a tab or a carriage return gets a
leading `'`, so a spreadsheet shows it as text instead of running it as a formula.

## Privacy and retention

A summary is derived from a customer conversation and can contain personal data. Treat the API
and any export the way you treat the conversations themselves.

- When a conversation is removed by the workspace's retention policy, its insight record is deleted
  with it.
- When an account is deleted, all of its insight records are deleted.
- A conversation that is not removed keeps its record. There is no separate way to delete a single
  record or to opt a conversation out.
