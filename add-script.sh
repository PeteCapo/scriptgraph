#!/bin/bash
# add-script.sh — add one or more analyzed script JSONs to the ScriptGraph public library
# Usage: bash add-script.sh file1.json [file2.json file3.json ...]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIBRARY_DIR="$SCRIPT_DIR/public/library"

if [ "$#" -eq 0 ]; then
  echo "Usage: bash add-script.sh file1.json [file2.json ...]"
  exit 1
fi

# Copy all provided JSON files into the library folder
for filepath in "$@"; do
  if [ ! -f "$filepath" ]; then
    echo "  ✗ Not found: $filepath"
    continue
  fi
  filename=$(basename "$filepath")
  cp "$filepath" "$LIBRARY_DIR/$filename"
  echo "  ✓ Copied: $filename"
done

# Rebuild manifest.json from all JSONs in the library folder (excluding manifest itself)
python3 -c "
import json, os
lib = '$LIBRARY_DIR'
files = sorted([f for f in os.listdir(lib) if f.endswith('.json') and f != 'manifest.json'])
with open(os.path.join(lib, 'manifest.json'), 'w') as f:
    json.dump(files, f, indent=2)
print(f'  ✓ Rebuilt manifest.json ({len(files)} scripts)')
"

# Commit and push
cd "$SCRIPT_DIR"
git add public/library/
git commit -m "Add scripts to library: $(basename -a "$@" | tr '\n' ' ')"
git push

echo ""
echo "  ✓ Done — live in ~60 seconds at scriptgraph.vercel.app"
