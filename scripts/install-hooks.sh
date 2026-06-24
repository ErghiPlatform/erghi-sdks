#!/bin/bash
# Install git hooks for chatflow-sdks repository

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GIT_DIR="$(git -C "$SCRIPT_DIR" rev-parse --git-dir 2>/dev/null)"

if [ -z "$GIT_DIR" ]; then
    echo "Error: Not a git repository or unable to find .git directory."
    exit 1
fi

HOOK_SRC="$SCRIPT_DIR/pre-commit.sh"
HOOK_DEST="$SCRIPT_DIR/../$GIT_DIR/hooks/pre-commit"

echo "Installing pre-commit hook to: $HOOK_DEST"

# Ensure source script is executable
chmod +x "$HOOK_SRC"

# Copy hook
cp "$HOOK_SRC" "$HOOK_DEST"
chmod +x "$HOOK_DEST"

echo "✅ Git hooks installed successfully for chatflow-sdks!"
