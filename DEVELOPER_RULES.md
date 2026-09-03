# AI Developer and Agent Rules - Erghi SDKs

Guidelines for modifying and expanding the Erghi client SDKs.

---

## 1. Project Overview & SDK Alignment

This repository contains client-side SDKs for integrating Erghi services into various client applications:
- **Angular / React / JavaScript / Widget (TS/JS)**: Web integrations, frontend UI packages.
- **Flutter / Dart**: Cross-platform mobile/web/desktop.
- **dotnet**: C# backend and desktop clients.
- **python**: Python backend, CLI, or machine learning clients.

Swift (Apple iOS/macOS platform native client) is **not** in this repo — it lives in its own
repo, [`ErghiPlatform/erghi-sdk-swift`](https://github.com/ErghiPlatform/erghi-sdk-swift), because
Swift Package Manager requires `Package.swift` at the root of whatever git URL it's given, which
a monorepo subdirectory can't satisfy. It previously lived here and was published via a `git
subtree` mirror step at release time; that was dropped in favor of developing it directly in its
own repo, to remove the confusion of two places holding "the real" source.

All SDKs must align with the open API definitions and maintain consistent naming conventions across languages (e.g., `Client` initialization, `sendMessage`, `getConversation`, webhook verification).

---

## 2. Platform-Specific Design Principles

- **Typing**: Make payloads type-safe. Ensure models represent correct payload fields returned from `erghi-conversation-api`.
- **Flutter/Dart**: Follow standard `lints` or `flutter_lints` patterns. Use asynchronous operations (`async`/`await`) and Stream controllers for live messages.
- **React/JS**: Leverage lightweight client architectures to keep widget sizes low. Minimize external dependencies.
- **Python**: Use standard type annotations and modern http clients (e.g., `httpx` or `aiohttp`).

---

## 3. Pre-Commit Validation

- Hooks are installed via `scripts/pre-commit.sh`. They run:
  - `dart/flutter analyze` for Dart/Flutter changes.
  - `dotnet format` for C# changes.
  - `python -m py_compile` for Python syntax validation.
- Make sure to correct any linting/syntax warnings before committing.
