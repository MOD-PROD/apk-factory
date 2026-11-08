#!/usr/bin/env python3
from pathlib import Path

p = Path("index.html")
t = p.read_text(encoding="utf-8")
if 'name="webTheme"' in t:
    print("webTheme already present")
    raise SystemExit(0)

old_ui = (
    '      <div class="field"><span>Orientation</span>\n'
    '        <div class="seg" role="radiogroup">\n'
    '          <label><input type="radio" name="orientation" value="portrait" checked><span>Portrait</span></label>\n'
    '          <label><input type="radio" name="orientation" value="auto"><span>Suit la rotation</span></label>\n'
    '        </div></div>\n'
    '\n'
    '      <label class="check"><input type="checkbox" name="fullscreen" value="true"><span>Plein \u00e9cran (masque la barre d\'\u00e9tat)</span></label>'
)

new_ui = (
    '      <div class="field"><span>Orientation</span>\n'
    '        <div class="seg" role="radiogroup">\n'
    '          <label><input type="radio" name="orientation" value="portrait" checked><span>Portrait</span></label>\n'
    '          <label><input type="radio" name="orientation" value="auto"><span>Suit la rotation</span></label>\n'
    '        </div></div>\n'
    '\n'
    '      <div class="field"><span>Th\u00e8me des sites web</span>\n'
    '        <div class="seg" role="radiogroup">\n'
    '          <label><input type="radio" name="webTheme" value="auto" checked><span>Auto</span></label>\n'
    '          <label><input type="radio" name="webTheme" value="native"><span>Sombre natif</span></label>\n'
    '          <label><input type="radio" name="webTheme" value="css"><span>CSS</span></label>\n'
    '          <label><input type="radio" name="webTheme" value="invert"><span>Inversion</span></label>\n'
    '        </div>\n'
    '        <small class="hint">Auto respecte le site. Natif utilise le dark mode Android. CSS et inversion injectent des styles (exp\u00e9rimental, selon le site).</small></div>\n'
    '\n'
    '      <label class="check"><input type="checkbox" name="fullscreen" value="true"><span>Plein \u00e9cran (masque la barre d\'\u00e9tat)</span></label>'
)

old_fd = (
    '  fd.append("orientation", f.orientation.value);\n'
    '  ["fullscreen", "keepScreenOn", "zoom", "camera", "microphone", "location", "blockScreenshots"]\n'
    '    .forEach(k => fd.append(k, f.elements[k].checked ? "true" : "false"));'
)

new_fd = (
    '  fd.append("orientation", f.orientation.value);\n'
    '  fd.append("webTheme", (f.webTheme && f.webTheme.value) || "auto");\n'
    '  ["fullscreen", "keepScreenOn", "zoom", "camera", "microphone", "location", "blockScreenshots"]\n'
    '    .forEach(k => fd.append(k, f.elements[k].checked ? "true" : "false"));'
)

if old_ui not in t:
    raise SystemExit("orientation block not found")
if old_fd not in t:
    raise SystemExit("formData block not found")

t = t.replace(old_ui, new_ui, 1).replace(old_fd, new_fd, 1)
p.write_text(t, encoding="utf-8")
print("patched", len(t), "webTheme", t.count("webTheme"))
