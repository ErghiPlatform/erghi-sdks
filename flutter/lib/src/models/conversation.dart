import 'package:equatable/equatable.dart';
import 'package:json_annotation/json_annotation.dart';

part 'conversation.g.dart';

@JsonSerializable(createFactory: false)
class Conversation extends Equatable {
  final String id;
  final String widgetId;
  final String? visitorId;
  final String? assignedTo;
  final ConversationStatus status;
  final Map<String, dynamic>? metadata;
  final DateTime createdAt;
  final DateTime updatedAt;
  final Message? lastMessage;
  final int unreadCount;

  const Conversation({
    required this.id,
    required this.widgetId,
    this.visitorId,
    this.assignedTo,
    required this.status,
    this.metadata,
    required this.createdAt,
    required this.updatedAt,
    this.lastMessage,
    this.unreadCount = 0,
  });

  /// Reads what the API sends: PascalCase status ("Open"), `assignedAgentId` and `startedAt`
  /// (the older names `assignedTo`, `createdAt` and `updatedAt` are still accepted).
  factory Conversation.fromJson(Map<String, dynamic> json) {
    final started = json['createdAt'] ?? json['startedAt'];
    final last = json['lastMessage'];
    return Conversation(
      id: json['id'] as String,
      widgetId: json['widgetId'] as String,
      visitorId: json['visitorId'] as String?,
      assignedTo: (json['assignedTo'] ?? json['assignedAgentId']) as String?,
      status: ConversationStatus.parse(json['status'] as String?),
      metadata: json['metadata'] as Map<String, dynamic>?,
      createdAt: DateTime.parse(started as String),
      updatedAt: DateTime.parse(
          (json['updatedAt'] ?? json['closedAt'] ?? started) as String),
      lastMessage: last is Map<String, dynamic> ? Message.fromJson(last) : null,
      unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0,
    );
  }
  Map<String, dynamic> toJson() => _$ConversationToJson(this);

  @override
  List<Object?> get props => [
        id,
        widgetId,
        visitorId,
        assignedTo,
        status,
        metadata,
        createdAt,
        updatedAt,
        lastMessage,
        unreadCount,
      ];
}

enum ConversationStatus {
  @JsonValue('open')
  open,
  @JsonValue('assigned')
  assigned,
  @JsonValue('resolved')
  resolved,
  @JsonValue('closed')
  closed,
  @JsonValue('queued')
  queued,
  @JsonValue('snoozed')
  snoozed;

  /// The API sends PascalCase ("Open", "Queued"...); matching ignores case. An unknown future
  /// status becomes [open] rather than failing the whole response.
  static ConversationStatus parse(String? value) {
    final v = value?.toLowerCase();
    for (final s in ConversationStatus.values) {
      if (s.name == v) return s;
    }
    return ConversationStatus.open;
  }
}

@JsonSerializable(createFactory: false)
class Message extends Equatable {
  final String id;
  final String conversationId;
  final String senderId;
  final MessageSender senderType;
  final String content;
  final MessageType type;
  final Map<String, dynamic>? metadata;
  final DateTime createdAt;
  final bool isRead;

  /// 'voice' when the visitor sent it as a voice note (content is the transcript).
  final String? source;

  const Message({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.senderType,
    required this.content,
    required this.type,
    this.metadata,
    required this.createdAt,
    this.isRead = false,
    this.source,
  });

  /// Reads what the API sends: `sender` ("visitor", "agent", "bot"...), PascalCase `type`
  /// ("Text"), a nullable `senderId` and `readAt` (the older `senderType` and `isRead` still work).
  factory Message.fromJson(Map<String, dynamic> json) => Message(
        id: json['id'] as String,
        conversationId: json['conversationId'] as String,
        senderId: (json['senderId'] as String?) ?? '',
        senderType:
            MessageSender.parse((json['senderType'] ?? json['sender']) as String?),
        content: json['content'] as String,
        type: MessageType.parse(json['type'] as String?),
        metadata: json['metadata'] as Map<String, dynamic>?,
        createdAt: DateTime.parse(json['createdAt'] as String),
        isRead: (json['isRead'] as bool?) ?? json['readAt'] != null,
        source: json['source'] as String?,
      );
  Map<String, dynamic> toJson() => _$MessageToJson(this);

  @override
  List<Object?> get props => [
        id,
        conversationId,
        senderId,
        senderType,
        content,
        type,
        metadata,
        createdAt,
        isRead,
        source,
      ];
}

enum MessageSender {
  @JsonValue('user')
  user,
  @JsonValue('visitor')
  visitor,
  @JsonValue('system')
  system,
  @JsonValue('ai')
  ai,
  @JsonValue('agent')
  agent,
  @JsonValue('bot')
  bot;

  /// Matching ignores case; an unknown sender becomes [system].
  static MessageSender parse(String? value) {
    final v = value?.toLowerCase();
    for (final s in MessageSender.values) {
      if (s.name == v) return s;
    }
    return MessageSender.system;
  }
}

enum MessageType {
  @JsonValue('text')
  text,
  @JsonValue('image')
  image,
  @JsonValue('file')
  file,
  @JsonValue('system')
  system;

  /// The API sends PascalCase ("Text"); matching ignores case. Unknown becomes [text].
  static MessageType parse(String? value) {
    final v = value?.toLowerCase();
    for (final s in MessageType.values) {
      if (s.name == v) return s;
    }
    return MessageType.text;
  }
}

@JsonSerializable()
class SendMessageRequest {
  final String content;
  final MessageType type;
  final Map<String, dynamic>? metadata;

  const SendMessageRequest({
    required this.content,
    this.type = MessageType.text,
    this.metadata,
  });

  Map<String, dynamic> toJson() => _$SendMessageRequestToJson(this);
}

@JsonSerializable(genericArgumentFactories: true)
class PaginatedResponse<T> {
  final List<T> data;
  final int page;
  final int limit;
  final int total;
  final int totalPages;

  const PaginatedResponse({
    required this.data,
    required this.page,
    required this.limit,
    required this.total,
    required this.totalPages,
  });

  factory PaginatedResponse.fromJson(
    Map<String, dynamic> json,
    T Function(Object? json) fromJsonT,
  ) {
    return PaginatedResponse<T>(
      data: (json['data'] as List<dynamic>).map((e) => fromJsonT(e)).toList(),
      page: json['page'] as int,
      limit: json['limit'] as int,
      total: json['total'] as int,
      totalPages: json['totalPages'] as int,
    );
  }
}
