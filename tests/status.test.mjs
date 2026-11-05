import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/status.js";

const JOB = "20261105-1016-a1b2c3";
function setup({ conclusion = "success", ageMs = 0, runStatus = "completed", concurrentDone = false } = {}) {
  const job = { job: JOB, status: "queued", createdAt: new Date(Date.now() - 60000).toISOString(), files: [] };
  let reads = 0;
  const writes = [];
  const env = {
    GITHUB_TOKEN: "test-token",
    FILES: {
      async get() {
        reads++;
        const current = concurrentDone && reads > 1
          ? { ...job, status: "done", apkName: "test.apk", dlKey: "key" }
          : job;
        return { async json() { return structuredClone(current); } };
      },
      async put(key, content) { writes.push(JSON.parse(content)); }
    }
  };
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    workflow_runs: [{
      id: 42,
      display_title: `[${JOB}] test`,
      status: runStatus,
      conclusion,
      updated_at: new Date(Date.now() - ageMs).toISOString(),
      html_url: "https://github.com/MOD-PROD/apk-factory/actions/runs/42"
    }]
  }), { status: 200 });
  return {
    env, writes,
    request: { async json() { return { job: JOB }; } },
    restore() { globalThis.fetch = savedFetch; }
  };
}

test("completed successful run without callback stays in finalization during grace period", async () => {
  const ctx = setup({ ageMs: 30000 });
  try {
    const r = await onRequestPost(ctx);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).status, "running");
    assert.equal(ctx.writes.length, 1);
  } finally { ctx.restore(); }
});

test("completed successful run with missing callback eventually reports failure", async () => {
  const ctx = setup({ ageMs: 180000 });
  try {
    const r = await onRequestPost(ctx);
    const data = await r.json();
    assert.equal(data.status, "failed");
    assert.match(data.error, /sans confirmer/);
  } finally { ctx.restore(); }
});

test("status polling does not overwrite an APK delivered concurrently", async () => {
  const ctx = setup({ concurrentDone: true });
  try {
    const r = await onRequestPost(ctx);
    const data = await r.json();
    assert.equal(data.status, "done");
    assert.match(data.apk.url, /\/api\/runner\/dl/);
    assert.equal(ctx.writes.length, 0);
  } finally { ctx.restore(); }
});
