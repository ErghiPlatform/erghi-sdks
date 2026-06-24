# AI Developer and Agent Rules - ChatFlow SDKs

Guidelines for modifying and expanding the ChatFlow client SDKs.

---

## 1. Project Overview & SDK Alignment

This repository contains client-side SDKs for integrating ChatFlow services into various client applications:
- **Angular / React / JavaScript / Widget (TS/JS)**: Web integrations, frontend UI packages.
- **Flutter / Dart**: Cross-platform mobile/web/desktop.
- **dotnet**: C# backend and desktop clients.
- **python**: Python backend, CLI, or machine learning clients.
- **swift**: Apple iOS/macOS platform native client.

All SDKs must align with the open API definitions and maintain consistent naming conventions across languages (e.g., `Client` initialization, `sendMessage`, `getConversation`, webhook verification).

---

## 2. Platform-Specific Design Principles

- **Typing**: Make payloads type-safe. Ensure models represent correct payload fields returned from `chatflow-conversation-api`.
- **Flutter/Dart**: Follow standard `lints` or `flutter_lints` patterns. Use asynchronous operations (`async`/`await`) and Stream controllers for live messages.
- **React/JS**: Leverage lightweight client architectures to keep widget sizes low. Minimize external dependencies.
- **Python**: Use standard type annotations and modern http clients (e.g., `httpx` or `aiohttp`).

---

## 3. Pre-Commit Validation

- Hooks are installed via `scripts/pre-commit.sh`. They run:
  - `dart/flutter analyze` for Dart/Flutter changes.
  - `dotnet format` for C# changes.
  - `swiftc -parse` for Swift syntax checks.
  - `python -m py_compile` for Python syntax validation.
- Make sure to correct any linting/syntax warnings before committing.
