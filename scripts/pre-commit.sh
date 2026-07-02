#!/bin/bash
# Pre-commit hook for erghi-sdks repository.
set -e

echo "=== Running pre-commit validation for SDKs ==="

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
    echo "No staged changes to validate."
    exit 0
fi

FAILED=0

for FILE in $STAGED_FILES; do
    ABS_PATH="$(pwd)/$FILE"

    if [ ! -f "$ABS_PATH" ]; then
        continue
    fi

    case "$FILE" in
        *.cs)
            echo "Checking C# formatting for: $FILE"
            # Find the containing project/solution
            DIR=$(dirname "$FILE")
            WORKSPACE_PATH=""
            while [ "$DIR" != "." ] && [ "$DIR" != "/" ]; do
                if ls "$DIR"/*.csproj >/dev/null 2>&1; then
                    WORKSPACE_PATH=$(ls "$DIR"/*.csproj | head -n 1)
                    break
                elif ls "$DIR"/*.sln >/dev/null 2>&1; then
                    WORKSPACE_PATH=$(ls "$DIR"/*.sln | head -n 1)
                    break
                fi
                DIR=$(dirname "$DIR")
            done
            if [ -z "$WORKSPACE_PATH" ]; then
                WORKSPACE_PATH="."
            fi
            if ! dotnet format "$WORKSPACE_PATH" --verify-no-changes --include "$FILE"; then
                echo "❌ Formatting issue found in $FILE"
                FAILED=1
            fi
            ;;
        *.py)
            echo "Checking Python syntax for: $FILE"
            if ! python3 -m py_compile "$ABS_PATH"; then
                echo "❌ Python syntax error in $FILE"
                FAILED=1
            fi
            ;;
        *.dart)
            echo "Checking Dart/Flutter style/syntax for: $FILE"
            # Get directory containing pubspec.yaml if we want to run analyze there
            DIR=$(dirname "$FILE")
            while [ "$DIR" != "." ] && [ "$DIR" != "/" ]; do
                if [ -f "$DIR/pubspec.yaml" ]; then
                    cd "$DIR"
                    if ! flutter analyze --no-pub; then
                        # Fallback to dart analyze if needed
                        if ! dart analyze; then
                            echo "❌ Dart analysis failed in $FILE"
                            FAILED=1
                        fi
                    fi
                    cd - > /dev/null
                    break
                fi
                DIR=$(dirname "$DIR")
            done
            ;;
        *.swift)
            echo "Checking Swift syntax for: $FILE"
            if ! swiftc -parse "$ABS_PATH"; then
                echo "❌ Swift syntax error in $FILE"
                FAILED=1
            fi
            ;;
        *.js|*.jsx)
            echo "Checking JavaScript syntax for: $FILE"
            if ! node --check "$ABS_PATH"; then
                echo "❌ JS syntax error in $FILE"
                FAILED=1
            fi
            ;;
    esac
done

if [ $FAILED -ne 0 ]; then
    echo "❌ Git pre-commit validation failed. Please fix issues before committing."
    exit 1
else
    echo "✅ Git pre-commit validation passed."
    exit 0
fi
