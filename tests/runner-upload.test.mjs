import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/runner/upload.js";

const JOB = "20261105-1016-a1b2c3";
const TOKEN = "private-callback-token";
const MAX_APK = 95 * 1024 * 1024;
const url = (query = "") => `https://apk-factory.modprod.app/api/runner/upload?job=${JOB}&name=test.apk${query}`;

function setup({ status = "queued", authorization = `Bearer ${TOKEN}`, contentLength = null, payload = new Uint8Array([80, 75, 3, 4]) } = {}) {
  const job = { job: JOB, status, files: [] };
  const objects = new Map([[ `jobs/${JOB}/job.json`, JSON.stringify(job) ]]);
  const writes = [];
  const env = {
    CALLBACK_TOKEN: TOKEN,
    FILES: {
      async get(key) { const value = objects.get(key); return value == null ? null : { async json() { return JSON.parse(value); } }; },
      async put(key, value) { writes.push(key); objects.set(key, value); },
      async delete(key) { objects.delete(key); }
    }
  };
  const request = {
    url: url(),
    headers: new Headers({ ...(authorization ? { authorization } : {}), ...(contentLength === null ? {} : { "content-length": String(contentLength) }) }),
    async arrayBuffer() { return payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength); },
    async text() { return "failed"; }
  };
  return { env, request, writes };
}

test("rejects a callback without the shared token", async () => {
  const ctx = setup({ authorization: "" });
  const response = await onRequestPost(ctx);
  assert.equal(response.status, 401);
  assert.deepEqual(ctx.writes, []);
});

test("rejects replayed callbacks for a finished job", async () => {
  for (const status of ["done", "failed"]) {
    const ctx = setup({ status });
    const response = await onRequestPost(ctx);
    assert.equal(response.status, 409);
    assert.deepEqual(ctx.writes, []);
  }
});

test("rejects APK bytes larger than limit even without Content-Length", async () => {
  const ctx = setup({ payload: new Uint8Array(MAX_APK + 1) });
  const response = await onRequestPost(ctx);
  assert.equal(response.status, 413);
  assert.deepEqual(ctx.writes, []);
});

test("rejects invalid APK signatures", async () => {
  const ctx = setup({ payload: new Uint8Array([0, 1, 2, 3]) });
  const response = await onRequestPost(ctx);
  assert.equal(response.status, 400);
  assert.deepEqual(ctx.writes, []);
});

test("accepts a valid APK callback and records the job", async () => {
  const ctx = setup();
  const response = await onRequestPost(ctx);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "done");
  assert.ok(ctx.writes.includes(`jobs/${JOB}/test.apk`));
  assert.ok(ctx.writes.includes(`jobs/${JOB}/job.json`));
});
