#!/usr/bin/env python3
from pathlib import Path

p = Path(".github/workflows/build-app.yml")
t = p.read_text(encoding="utf-8")
if "use_native_ui" in t and "native-ui-experimental" in t:
    print("already patched")
    raise SystemExit(0)

old_call = """      smoke_r2:
        type: boolean
        default: false
  workflow_dispatch:"""
new_call = """      smoke_r2:
        type: boolean
        default: false
      use_native_ui:
        description: "Base + patches experimentaux WebTheme (ne pas utiliser en prod)"
        type: boolean
        default: false
  workflow_dispatch:"""
if old_call not in t:
    raise SystemExit("workflow_call smoke_r2 block not found")
t = t.replace(old_call, new_call, 1)

old_reg = """      reglages:
        description: 'site-web / html : reglages en JSON (facultatif), ex. {"fullscreen":true,"barsColor":"#FAFAFA"}'
        default: ""
"""
# tolerate both accents and non-accents in description
import re
m = re.search(r"      reglages:\n        description: 'site-web / html :[^']*'\n        default: \"\"\n", t)
if not m:
    raise SystemExit("reglages block not found")
new_reg = """      reglages:
        description: 'site-web / html : reglages en JSON (facultatif), ex. {"fullscreen":true,"barsColor":"#FAFAFA","webTheme":"native"}'
        default: ""
      use_native_ui:
        description: "Utiliser base + patches experimentaux WebTheme (test uniquement)"
        type: boolean
        default: false
"""
t = t[:m.start()] + new_reg + t[m.end():]

old_dl = """          MPP_URL=$(curl -fsSL "https://raw.githubusercontent.com/${PATCHES_REPO}/main/patches-bundle.json" \\\n            | python3 -c 'import json,sys; print(json.load(sys.stdin)["download_url"])')
          echo "Patches : $MPP_URL"
          curl -fsSL -o tools/patches.mpp "$MPP_URL"
          for b in apk-base.apk atv-base.apk; do
            curl -fsSL -o "tools/$b" "https://github.com/${PATCHES_REPO}/releases/download/base-apk/$b"
          done
"""
new_dl = """          USE_NATIVE_UI="${{ inputs.use_native_ui }}"
          if [ "$USE_NATIVE_UI" = "true" ]; then
            echo "Mode experimental native-ui : base + patches depuis release native-ui-experimental"
            MPP_URL="https://github.com/${PATCHES_REPO}/releases/download/native-ui-experimental/patches-native-ui.mpp"
            BASE_TAG="native-ui-experimental"
          else
            MPP_URL=$(curl -fsSL "https://raw.githubusercontent.com/${PATCHES_REPO}/main/patches-bundle.json" \\\n              | python3 -c 'import json,sys; print(json.load(sys.stdin)["download_url"])')
            BASE_TAG="base-apk"
          fi
          echo "Patches : $MPP_URL"
          echo "Base release : $BASE_TAG"
          curl -fsSL -o tools/patches.mpp "$MPP_URL"
          for b in apk-base.apk atv-base.apk; do
            if [ "$BASE_TAG" = "native-ui-experimental" ] && [ "$b" = "atv-base.apk" ]; then
              curl -fsSL -o "tools/$b" "https://github.com/${PATCHES_REPO}/releases/download/base-apk/$b" || true
            else
              curl -fsSL -o "tools/$b" "https://github.com/${PATCHES_REPO}/releases/download/${BASE_TAG}/$b"
            fi
          done
"""
if old_dl not in t:
    raise SystemExit("download block not found")
t = t.replace(old_dl, new_dl, 1)
p.write_text(t, encoding="utf-8")
print("patched", len(t))
