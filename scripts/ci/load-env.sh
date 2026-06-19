#!/usr/bin/env bash
# Sources .env.local from the repo root, stripping quotes and whitespace from values.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../../.env.local"

if [[ -f "$ENV_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip blank lines and comments
    [[ "$line" =~ ^[[:space:]]*$ || "$line" =~ ^[[:space:]]*# ]] && continue
    # Must contain an = sign
    [[ "$line" != *=* ]] && continue

    key="${line%%=*}"
    value="${line#*=}"

    # Strip inline comments (anything after unquoted #)
    value="${value%%#*}"
    # Trim leading/trailing whitespace
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    # Strip surrounding double or single quotes
    if [[ "$value" =~ ^\"(.*)\"$ ]]; then
      value="${BASH_REMATCH[1]}"
    elif [[ "$value" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi

    export "$key=$value"
  done < "$ENV_FILE"
fi
