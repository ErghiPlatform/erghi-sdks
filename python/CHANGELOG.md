## Unreleased

- `Message.source` ("voice" for a visitor voice note, whose `content` is the transcript).

## 1.0.0

- Initial release.
- Real-time chat backed by a hand-implemented SignalR wire protocol (negotiate + handshake + framed invocations) on top of `websockets`, since no official SignalR client exists for Python.
