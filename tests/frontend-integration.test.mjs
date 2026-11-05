import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("all inline APK Factory scripts are syntactically valid", () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0, "Expected inline application scripts");
  for (const [index, script] of scripts.entries()) {
    if (/\bsrc\s*=/.test(script[1]) || /\btype\s*=\s*["']application\//.test(script[1])) continue;
    assert.doesNotThrow(() => new vm.Script(script[2], { filename: `index.html-script-${index}.js` }));
  }
});

test("APK Factory links to ModProd Dashboard and AppMod", () => {
  assert.match(html, /https:\/\/dashboard\.modprod\.app\/applications\/apk-factory/);
  assert.match(html, /https:\/\/admin\.modprod\.app\//);
});

test("AppMod features align with actual builders and submission checks", () => {
  for (const name of ["atv", "siteWeb", "html"]) {
    assert.ok(html.includes(`data-feature="${name}"`), `Missing UI feature ${name}`);
  }
  assert.match(html, /MP\.feature\("atv"\) !== "on"/);
  assert.match(html, /MP\.feature\(isHtml \? "html" : "siteWeb"\) !== "on"/);
});
