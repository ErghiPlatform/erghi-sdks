## 1.0.1

- Fix package description metadata (no functional changes).

## 1.0.0

- Initial release.
- Real-time chat backed by the actual SignalR wire protocol (negotiate + handshake + framed invocations), implemented directly on top of `web_socket_channel` since no official SignalR client exists for Dart.
