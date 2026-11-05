import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/runner/cleanup.js";

const OLD = "20260101-0101-a1b2c3";
const FRESH = "20261105-1200-abcdef";
const TOKEN = "test-cleanup-token";

function setup(authorized = true) {
  const old = "jobs/" + OLD + "/", fresh = "jobs/" + FRESH + "/";
  const map = new Map([
    [old + "job.json", JSON.stringify({ job: OLD, createdAt: "2026-01-01T01:01:00.000Z", status: "done" })],
    [old + "my.apk", Uint8Array.of(80, 75, 3, 4)],
    [fresh + "job.json", JSON.stringify({ job: FRESH, createdAt: new Date().toISOString(), status: "done" })],
    [fresh + "new.apk", Uint8Array.of(80, 75, 3, 4)],
    ["jobs/not-a-job/foreign.apk", Uint8Array.of(80, 75)],
    ["unrelated/private.txt", "keep"]
  ]);
  const deleted = [];
  const env = {
    CALLBACK_TOKEN: TOKEN,
    FILES: {
      async get(key) {
        const value = map.get(key);
        return value === undefined ? null : { async json() { return JSON.parse(value); } };
      },
      async list({ prefix, delimiter }) {
        if (delimiter === "/") {
          const prefixes = [...new Set([...map.keys()].filter(k => k.startsWith(prefix))
            .map(k => prefix + k.slice(prefix.length).split("/")[0] + "/"))];
          return { delimitedPrefixes: prefixes, truncated: false, objects: [] };
        }
        return { objects: [...map.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })),
          truncated: false };
      },
      async delete(keys) {
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          deleted.push(key);
          map.delete(key);
        }
      }
    }
  };
  const request = { headers: new Headers(authorized ? { Authorization: "Bearer " + TOKEN } : {}) };
  return { env, request, map, deleted };
}

test("cleanup physically deletes expired APK and metadata, leaves fresh and unrelated objects", async () => {
  const ctx = setup();
  const response = await onRequestPost(ctx);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.objectsDeleted, 2);
  assert.deepEqual(ctx.deleted.sort(), ["jobs/" + OLD + "/job.json", "jobs/" + OLD + "/my.apk"].sort());
  assert.ok(ctx.map.has("jobs/" + FRESH + "/new.apk"));
  assert.ok(ctx.map.has("unrelated/private.txt"));
  assert.ok(ctx.map.has("jobs/not-a-job/foreign.apk"));
});

test("cleanup rejects unauthorized requests without deleting anything", async () => {
  const ctx = setup(false);
  const response = await onRequestPost(ctx);
  assert.equal(response.status, 401);
  assert.equal(ctx.deleted.length, 0);
});

test("cleanup never removes fresh metadata despite an old-looking key", async () => {
  const ctx = setup();
  ctx.map.set("jobs/" + OLD + "/job.json", JSON.stringify({
    job: OLD, createdAt: new Date().toISOString(), status: "running"
  }));
  const response = await onRequestPost(ctx);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).objectsDeleted, 0);
  assert.ok(ctx.map.has("jobs/" + OLD + "/my.apk"));
});
