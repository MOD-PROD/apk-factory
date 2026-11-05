import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/status.js";

test("rapid status requests read R2 but call GitHub at most once per 15 seconds", async () => {
  const job = "20261105-1515-a1b2c3";
  let state = {
    job, status: "queued", createdAt: new Date().toISOString(),
    statusKey: "a".repeat(48), appName: "Rate limited"
  };
  let writes = 0, ghCalls = 0;
  const env = {
    GITHUB_TOKEN: "test-github-token",
    FILES: {
      async get() { return { async json() { return structuredClone(state); } }; },
      async put(path, value) { state = JSON.parse(value); writes++; }
    }
  };
  const request = () => ({ async json() { return { job, statusKey: "a".repeat(48) }; } });
  const previous = globalThis.fetch;
  globalThis.fetch = async () => {
    ghCalls++;
    return Response.json({
      workflow_runs: [{ display_title: "[" + job + "] APK", id: 5,
        status: "in_progress", html_url: "https://github.com/MOD-PROD/apk-factory/actions/runs/5" }]
    });
  };
  try {
    assert.equal((await onRequestPost({ request: request(), env })).status, 200);
    assert.equal((await onRequestPost({ request: request(), env })).status, 200);
    assert.equal((await onRequestPost({ request: request(), env })).status, 200);
    assert.equal(ghCalls, 1);
    assert.equal(writes, 1);
    // A signed GitHub callback may finish while queries are throttled.
    state.status = "done";
    state.apkName = "ready.apk";
    state.apkSize = 128;
    state.dlKey = "b".repeat(32);
    const result = await (await onRequestPost({ request: request(), env })).json();
    assert.equal(result.status, "done");
    assert.equal(result.apk.name, "ready.apk");
    assert.equal(ghCalls, 1);
  } finally {
    globalThis.fetch = previous;
  }
});
