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
> switched on by Erghi for a deployment, not by you in the admin app. Until it is on, the API
> answers normally but returns zero conversations.

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

1. A background sweep runs every couple of minutes, but only when the feature is enabled for the
   deployment. It picks conversations that are resolved or closed, have been quiet for 5 minutes,
   were last active in the past 14 days and have no record yet (or were reopened and closed again).
   Turning the feature on therefore never classifies older history.
2. Erghi already knows some facts for certain: whether the conversation was handed off, whether a
   human replied and how it ended. The outcome comes from those facts wherever they settle it.
   The model decides only the ambiguous cases, such as a visitor who stopped replying after the
   AI answered.
3. The model sees the conversation summary and up to the 50 most recent messages and returns the
   fields above. A conversation with no visitor message needs no model call and is recorded as
   `SpamOrEmpty`.
4. Each classification is a model call on a low-cost model. It counts toward the workspace's
   monthly AI spend cap like any other call. At the cap, classification pauses and resumes after
   the cap resets.

A failed classification is retried after an hour. A reopened conversation keeps its old record,
marked `stale`, until it closes again and is reclassified.

## Who can read it

Reading needs the workspace permission **`view_insights`**, which the Owner and Admin roles have.
Other roles get `403`.

Workspace API keys and client-credentials tokens **cannot** hold `view_insights`, so they get `403`
too. Call the API with a signed-in Owner or Admin's access token. The same applies to the SDK
`insights` methods and to the `get_insights_summary` and `list_insight_conversations` tools of the
[MCP server](./MCP_SERVER.md), which only appear for a key that holds the scope.

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
