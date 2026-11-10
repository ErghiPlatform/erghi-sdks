import 'package:equatable/equatable.dart';

/// Filters shared by insights summary, list and export. All optional.
///
/// [sentiment]: positive, neutral or negative. [outcome]: resolved_by_ai,
/// resolved_by_agent, handed_off_unresolved, abandoned or spam_or_empty.
/// [minConfidence] is 0 to 1.
class InsightFilter extends Equatable {
  final DateTime? from;
  final DateTime? to;
  final String? channel;
  final String? category;
  final String? topic;
  final String? sentiment;
  final String? outcome;
  final double? minConfidence;

  const InsightFilter({
    this.from,
    this.to,
    this.channel,
    this.category,
    this.topic,
    this.sentiment,
    this.outcome,
    this.minConfidence,
  });

  Map<String, String> toQuery() => {
        if (from != null) 'from': from!.toUtc().toIso8601String(),
        if (to != null) 'to': to!.toUtc().toIso8601String(),
        if (channel != null && channel!.isNotEmpty) 'channel': channel!,
        if (category != null && category!.isNotEmpty) 'category': category!,
        if (topic != null && topic!.isNotEmpty) 'topic': topic!,
        if (sentiment != null && sentiment!.isNotEmpty) 'sentiment': sentiment!,
        if (outcome != null && outcome!.isNotEmpty) 'outcome': outcome!,
        if (minConfidence != null) 'minConfidence': '$minConfidence',
      };

  @override
  List<Object?> get props => [from, to, channel, category, topic, sentiment, outcome, minConfidence];
}

class InsightCount extends Equatable {
  final String key;
  final int count;

  const InsightCount({required this.key, required this.count});

  factory InsightCount.fromJson(Map<String, dynamic> json) =>
      InsightCount(key: json['key'] as String, count: (json['count'] as num).toInt());

  @override
  List<Object?> get props => [key, count];
}

class InsightSummary extends Equatable {
  final int total;

  /// AI-resolved over conversations that needed a reply (spam/empty excluded); null when none.
  final double? aiResolvedRate;
  final List<InsightCount> outcomes;
  final List<InsightCount> sentiments;
  /// Null when the workspace's plan locks the field (named in [locked]).
  final List<InsightCount>? categories;
  final List<InsightCount>? topics;
  final List<InsightCount>? languages;

  /// The workspace's effective plan, the fields it locks, counts of locked topics/categories,
  /// the days of history it can read, and the effective start of that window.
  final String? plan;
  final List<String> locked;
  final Map<String, int> lockedCounts;
  final int? windowDays;
  final DateTime? from;

  const InsightSummary({
    required this.total,
    this.aiResolvedRate,
    this.outcomes = const [],
    this.sentiments = const [],
    this.categories,
    this.topics,
    this.languages,
    this.plan,
    this.locked = const [],
    this.lockedCounts = const {},
    this.windowDays,
    this.from,
  });

  static List<InsightCount> _counts(Object? raw) => ((raw as List?) ?? const [])
      .map((e) => InsightCount.fromJson(e as Map<String, dynamic>))
      .toList();

  static List<InsightCount>? _lockableCounts(Object? raw) => raw == null ? null : _counts(raw);

  factory InsightSummary.fromJson(Map<String, dynamic> json) => InsightSummary(
        total: (json['total'] as num).toInt(),
        aiResolvedRate: (json['aiResolvedRate'] as num?)?.toDouble(),
        outcomes: _counts(json['outcomes']),
        sentiments: _counts(json['sentiments']),
        categories: _lockableCounts(json['categories']),
        topics: _lockableCounts(json['topics']),
        languages: _lockableCounts(json['languages']),
        plan: json['plan'] as String?,
        locked: ((json['locked'] as List?) ?? const []).map((e) => e as String).toList(),
        lockedCounts: ((json['lockedCounts'] as Map?) ?? const {})
            .map((k, v) => MapEntry(k as String, (v as num).toInt())),
        windowDays: (json['windowDays'] as num?)?.toInt(),
        from: json['from'] == null ? null : DateTime.parse(json['from'] as String),
      );

  @override
  List<Object?> get props => [
        total, aiResolvedRate, outcomes, sentiments, categories, topics, languages,
        plan, locked, lockedCounts, windowDays, from,
      ];
}

/// One classified conversation. Sentiments are Positive/Neutral/Negative; [outcome] is
/// ResolvedByAi, ResolvedByAgent, HandedOffUnresolved, Abandoned or SpamOrEmpty; [language]
/// is a BCP-47 tag; [stale] means it was reopened and is reclassified on its next close.
class InsightConversation extends Equatable {
  final String conversationId;
  /// Null when the plan locks the field (Starter): [topic], [category], [language],
  /// [summary] and [confidence].
  final String? topic;
  final String? category;
  final String sentiment;
  final String sentimentEnd;
  final String outcome;
  final String? language;
  final String? summary;
  final double? confidence;
  final DateTime classifiedAt;
  final bool stale;

  const InsightConversation({
    required this.conversationId,
    this.topic,
    this.category,
    required this.sentiment,
    required this.sentimentEnd,
    required this.outcome,
    this.language,
    this.summary,
    this.confidence,
    required this.classifiedAt,
    required this.stale,
  });

  factory InsightConversation.fromJson(Map<String, dynamic> json) => InsightConversation(
        conversationId: json['conversationId'] as String,
        topic: json['topic'] as String?,
        category: json['category'] as String?,
        sentiment: json['sentiment'] as String,
        sentimentEnd: json['sentimentEnd'] as String,
        outcome: json['outcome'] as String,
        language: json['language'] as String?,
        summary: json['summary'] as String?,
        confidence: (json['confidence'] as num?)?.toDouble(),
        classifiedAt: DateTime.parse(json['classifiedAt'] as String),
        stale: json['stale'] as bool,
      );

  @override
  List<Object?> get props => [
        conversationId, topic, category, sentiment, sentimentEnd, outcome,
        language, summary, confidence, classifiedAt, stale,
      ];
}

class InsightPage extends Equatable {
  final int total;
  final int page;
  final int pageSize;
  final List<InsightConversation> items;
  final String? plan;
  final List<String> locked;
  final int? windowDays;
  final DateTime? from;

  const InsightPage({
    required this.total,
    required this.page,
    required this.pageSize,
    required this.items,
    this.plan,
    this.locked = const [],
    this.windowDays,
    this.from,
  });

  factory InsightPage.fromJson(Map<String, dynamic> json) => InsightPage(
        total: (json['total'] as num).toInt(),
        page: (json['page'] as num).toInt(),
        pageSize: (json['pageSize'] as num).toInt(),
        items: ((json['items'] as List?) ?? const [])
            .map((e) => InsightConversation.fromJson(e as Map<String, dynamic>))
            .toList(),
        plan: json['plan'] as String?,
        locked: ((json['locked'] as List?) ?? const []).map((e) => e as String).toList(),
        windowDays: (json['windowDays'] as num?)?.toInt(),
        from: json['from'] == null ? null : DateTime.parse(json['from'] as String),
      );

  @override
  List<Object?> get props => [total, page, pageSize, items, plan, locked, windowDays, from];
}
