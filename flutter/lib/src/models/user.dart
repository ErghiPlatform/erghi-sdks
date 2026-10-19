import 'package:equatable/equatable.dart';
import 'package:json_annotation/json_annotation.dart';

part 'user.g.dart';

@JsonSerializable()
class User extends Equatable {
  final String id;
  final String email;
  final String firstName;
  final String lastName;
  final String? phoneNumber;
  final String? avatarUrl;
  final UserRole role;
  final bool emailVerified;
  final DateTime createdAt;
  final DateTime updatedAt;

  const User({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
    this.phoneNumber,
    this.avatarUrl,
    required this.role,
    required this.emailVerified,
    required this.createdAt,
    required this.updatedAt,
  });

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);

  /// Build from the auth server's (GoTrue) snake_case user object. The
  /// workspace role is read from `app_metadata.role` and defaults to member.
  factory User.fromGoTrue(Map<String, dynamic> json) {
    final metadata = json['user_metadata'] is Map<String, dynamic>
        ? json['user_metadata'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final appMetadata = json['app_metadata'] is Map<String, dynamic>
        ? json['app_metadata'] as Map<String, dynamic>
        : const <String, dynamic>{};
    String? text(String key) => metadata[key] is String ? metadata[key] as String : null;
    final createdAt = DateTime.tryParse(json['created_at']?.toString() ?? '') ??
        DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
    final phone = json['phone']?.toString();
    return User(
      id: json['id'] as String,
      email: json['email']?.toString() ?? '',
      firstName: text('first_name') ?? '',
      lastName: text('last_name') ?? '',
      phoneNumber: phone == null || phone.isEmpty ? null : phone,
      avatarUrl: text('avatar_url'),
      role: UserRole.values.firstWhere(
        (r) => r.name == appMetadata['role'],
        orElse: () => UserRole.member,
      ),
      emailVerified: json['email_confirmed_at'] != null,
      createdAt: createdAt,
      updatedAt: DateTime.tryParse(json['updated_at']?.toString() ?? '') ?? createdAt,
    );
  }
  Map<String, dynamic> toJson() => _$UserToJson(this);

  String get fullName => '$firstName $lastName';

  @override
  List<Object?> get props => [
        id,
        email,
        firstName,
        lastName,
        phoneNumber,
        avatarUrl,
        role,
        emailVerified,
        createdAt,
        updatedAt,
      ];
}

enum UserRole {
  @JsonValue('admin')
  admin,
  @JsonValue('member')
  member,
  @JsonValue('viewer')
  viewer,
}

@JsonSerializable()
class AuthResponse extends Equatable {
  final String accessToken;
  final String refreshToken;
  final User user;
  final int expiresIn;

  const AuthResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
    required this.expiresIn,
  });

  factory AuthResponse.fromJson(Map<String, dynamic> json) =>
      _$AuthResponseFromJson(json);

  /// Build from a GoTrue session, or from the bare user `/signup` returns while
  /// email confirmation is pending (tokens are then empty).
  factory AuthResponse.fromGoTrue(Map<String, dynamic> json) {
    final user = json['user'] is Map<String, dynamic>
        ? json['user'] as Map<String, dynamic>
        : json;
    return AuthResponse(
      accessToken: json['access_token']?.toString() ?? '',
      refreshToken: json['refresh_token']?.toString() ?? '',
      user: User.fromGoTrue(user),
      expiresIn: json['expires_in'] is int ? json['expires_in'] as int : 0,
    );
  }
  Map<String, dynamic> toJson() => _$AuthResponseToJson(this);

  @override
  List<Object?> get props => [accessToken, refreshToken, user, expiresIn];
}

@JsonSerializable()
class RegisterRequest {
  final String email;
  final String password;
  final String firstName;
  final String lastName;
  final String? phoneNumber;

  const RegisterRequest({
    required this.email,
    required this.password,
    required this.firstName,
    required this.lastName,
    this.phoneNumber,
  });

  Map<String, dynamic> toJson() => _$RegisterRequestToJson(this);
}

@JsonSerializable()
class LoginRequest {
  final String email;
  final String password;

  const LoginRequest({
    required this.email,
    required this.password,
  });

  Map<String, dynamic> toJson() => _$LoginRequestToJson(this);
}
