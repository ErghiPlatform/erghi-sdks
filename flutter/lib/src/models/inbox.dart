import 'package:equatable/equatable.dart';

DateTime _date(dynamic v) => DateTime.parse(v as String);
DateTime? _dateOrNull(dynamic v) =>
    v == null ? null : DateTime.parse(v as String);

/// A workspace conversation label.
class ConversationLabel extends Equatable {
  final String id;
  final String name;
  final String color;
  final String? description;

  const ConversationLabel(
      {required this.id,
      required this.name,
      required this.color,
      this.description});

  factory ConversationLabel.fromJson(Map<String, dynamic> json) =>
      ConversationLabel(
        id: json['id'] as String,
        name: json['name'] as String,
        color: json['color'] as String,
        description: json['description'] as String?,
      );

  @override
  List<Object?> get props => [id, name, color, description];
}

class ConversationLabelList extends Equatable {
  final int maxLabels;
  final List<ConversationLabel> labels;

  const ConversationLabelList({required this.maxLabels, required this.labels});

  factory ConversationLabelList.fromJson(Map<String, dynamic> json) =>
      ConversationLabelList(
        maxLabels: json['maxLabels'] as int,
        labels: (json['labels'] as List<dynamic>)
            .map((e) => ConversationLabel.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  @override
  List<Object?> get props => [maxLabels, labels];
}

/// A private (internal-only) note. Visitors never see notes. [conversationId] is set for
/// conversation notes and [contactId] for contact notes.
class InboxNote extends Equatable {
  final String id;
  final String? conversationId;
  final String? contactId;
  final String authorId;
  final String? authorName;
  final String content;
  final DateTime createdAt;
  final DateTime updatedAt;
  final bool canEdit;
  final bool canDelete;

  const InboxNote({
    required this.id,
    this.conversationId,
    this.contactId,
    required this.authorId,
    this.authorName,
    required this.content,
    required this.createdAt,
    required this.updatedAt,
    required this.canEdit,
    required this.canDelete,
  });

  factory InboxNote.fromJson(Map<String, dynamic> json) => InboxNote(
        id: json['id'] as String,
        conversationId: json['conversationId'] as String?,
        contactId: json['contactId'] as String?,
        authorId: json['authorId'] as String,
        authorName: json['authorName'] as String?,
        content: json['content'] as String,
        createdAt: _date(json['createdAt']),
        updatedAt: _date(json['updatedAt']),
        canEdit: json['canEdit'] as bool,
        canDelete: json['canDelete'] as bool,
      );

  @override
  List<Object?> get props => [
        id,
        conversationId,
        contactId,
        authorId,
        authorName,
        content,
        createdAt,
        updatedAt,
        canEdit,
        canDelete
      ];
}

class CannedResponse extends Equatable {
  final String id;
  final String shortCode;
  final String content;
  final DateTime updatedAt;

  const CannedResponse(
      {required this.id,
      required this.shortCode,
      required this.content,
      required this.updatedAt});

  factory CannedResponse.fromJson(Map<String, dynamic> json) => CannedResponse(
        id: json['id'] as String,
        shortCode: json['shortCode'] as String,
        content: json['content'] as String,
        updatedAt: _date(json['updatedAt']),
      );

  @override
  List<Object?> get props => [id, shortCode, content, updatedAt];
}

class CannedResponseList extends Equatable {
  final int maxResponses;
  final List<CannedResponse> responses;

  const CannedResponseList(
      {required this.maxResponses, required this.responses});

  factory CannedResponseList.fromJson(Map<String, dynamic> json) =>
      CannedResponseList(
        maxResponses: json['maxResponses'] as int,
        responses: (json['responses'] as List<dynamic>)
            .map((e) => CannedResponse.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  @override
  List<Object?> get props => [maxResponses, responses];
}

/// Requires platform PR #256.
class ContactSummary extends Equatable {
  final String id;
  final String? name;
  final String? email;
  final String? phone;
  final String? externalId;
  final DateTime firstSeenAt;
  final DateTime lastSeenAt;
  final bool blocked;
  final int conversationCount;

  const ContactSummary({
    required this.id,
    this.name,
    this.email,
    this.phone,
    this.externalId,
    required this.firstSeenAt,
    required this.lastSeenAt,
    required this.blocked,
    required this.conversationCount,
  });

  factory ContactSummary.fromJson(Map<String, dynamic> json) => ContactSummary(
        id: json['id'] as String,
        name: json['name'] as String?,
        email: json['email'] as String?,
        phone: json['phone'] as String?,
        externalId: json['externalId'] as String?,
        firstSeenAt: _date(json['firstSeenAt']),
        lastSeenAt: _date(json['lastSeenAt']),
        blocked: json['blocked'] as bool,
        conversationCount: json['conversationCount'] as int,
      );

  @override
  List<Object?> get props => [
        id,
        name,
        email,
        phone,
        externalId,
        firstSeenAt,
        lastSeenAt,
        blocked,
        conversationCount
      ];
}

/// Requires platform PR #256.
class ContactPage extends Equatable {
  final List<ContactSummary> items;
  final int total;
  final int page;
  final int pageSize;

  const ContactPage(
      {required this.items,
      required this.total,
      required this.page,
      required this.pageSize});

  factory ContactPage.fromJson(Map<String, dynamic> json) => ContactPage(
        items: (json['items'] as List<dynamic>)
            .map((e) => ContactSummary.fromJson(e as Map<String, dynamic>))
            .toList(),
        total: json['total'] as int,
        page: json['page'] as int,
        pageSize: json['pageSize'] as int,
      );

  @override
  List<Object?> get props => [items, total, page, pageSize];
}

class ContactConversation extends Equatable {
  final String id;
  final String channel;
  final String status;
  final DateTime startedAt;
  final DateTime? closedAt;
  final String? assignedAgentId;

  const ContactConversation({
    required this.id,
    required this.channel,
    required this.status,
    required this.startedAt,
    this.closedAt,
    this.assignedAgentId,
  });

  factory ContactConversation.fromJson(Map<String, dynamic> json) =>
      ContactConversation(
        id: json['id'] as String,
        channel: json['channel'] as String,
        status: json['status'] as String,
        startedAt: _date(json['startedAt']),
        closedAt: _dateOrNull(json['closedAt']),
        assignedAgentId: json['assignedAgentId'] as String?,
      );

  @override
  List<Object?> get props =>
      [id, channel, status, startedAt, closedAt, assignedAgentId];
}

/// Requires platform PR #256.
class ContactDetail extends Equatable {
  final String id;
  final String? name;
  final String? email;
  final String? phone;
  final String? externalId;
  final String? locale;
  final DateTime firstSeenAt;
  final DateTime lastSeenAt;
  final bool blocked;
  final DateTime? blockedAt;
  final List<ContactConversation> conversations;

  const ContactDetail({
    required this.id,
    this.name,
    this.email,
    this.phone,
    this.externalId,
    this.locale,
    required this.firstSeenAt,
    required this.lastSeenAt,
    required this.blocked,
    this.blockedAt,
    required this.conversations,
  });

  factory ContactDetail.fromJson(Map<String, dynamic> json) => ContactDetail(
        id: json['id'] as String,
        name: json['name'] as String?,
        email: json['email'] as String?,
        phone: json['phone'] as String?,
        externalId: json['externalId'] as String?,
        locale: json['locale'] as String?,
        firstSeenAt: _date(json['firstSeenAt']),
        lastSeenAt: _date(json['lastSeenAt']),
        blocked: json['blocked'] as bool,
        blockedAt: _dateOrNull(json['blockedAt']),
        conversations: (json['conversations'] as List<dynamic>)
            .map((e) => ContactConversation.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  @override
  List<Object?> get props => [
        id,
        name,
        email,
        phone,
        externalId,
        locale,
        firstSeenAt,
        lastSeenAt,
        blocked,
        blockedAt,
        conversations
      ];
}

class ContactEraseResult extends Equatable {
  final int conversationsDeleted;
  final int messagesDeleted;

  const ContactEraseResult(
      {required this.conversationsDeleted, required this.messagesDeleted});

  factory ContactEraseResult.fromJson(Map<String, dynamic> json) =>
      ContactEraseResult(
        conversationsDeleted: json['conversationsDeleted'] as int,
        messagesDeleted: json['messagesDeleted'] as int,
      );

  @override
  List<Object?> get props => [conversationsDeleted, messagesDeleted];
}

/// Requires platform PR #256.
class UserNotification extends Equatable {
  final String id;
  final String type;
  final String? conversationId;
  final String? noteId;
  final String? actorId;
  final String? actorName;
  final String? preview;
  final DateTime createdAt;
  final DateTime? readAt;

  const UserNotification({
    required this.id,
    required this.type,
    this.conversationId,
    this.noteId,
    this.actorId,
    this.actorName,
    this.preview,
    required this.createdAt,
    this.readAt,
  });

  factory UserNotification.fromJson(Map<String, dynamic> json) =>
      UserNotification(
        id: json['id'] as String,
        type: json['type'] as String,
        conversationId: json['conversationId'] as String?,
        noteId: json['noteId'] as String?,
        actorId: json['actorId'] as String?,
        actorName: json['actorName'] as String?,
        preview: json['preview'] as String?,
        createdAt: _date(json['createdAt']),
        readAt: _dateOrNull(json['readAt']),
      );

  @override
  List<Object?> get props => [
        id,
        type,
        conversationId,
        noteId,
        actorId,
        actorName,
        preview,
        createdAt,
        readAt
      ];
}

/// Requires platform PR #256.
class MentionableMember extends Equatable {
  final String userId;
  final String? displayName;

  const MentionableMember({required this.userId, this.displayName});

  factory MentionableMember.fromJson(Map<String, dynamic> json) =>
      MentionableMember(
          userId: json['userId'] as String,
          displayName: json['displayName'] as String?);

  @override
  List<Object?> get props => [userId, displayName];
}
