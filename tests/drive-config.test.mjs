import test from "node:test";
import assert from "node:assert/strict";
import { isJobExpired, JOB_RETENTION_MS } from "../functions/_shared.js";
import { onRequestGet as driveConfig } from "../functions/api/drive/config.js";

test("download jobs expire at 24h, not before", () => {
  const now = Date.now();
  assert.equal(isJobExpired({ createdAt: new Date(now - JOB_RETENTION_MS + 1000).toISOString() }, now), false);
  assert.equal(isJobExpired({ createdAt: new Date(now - JOB_RETENTION_MS).toISOString() }, now), true);
  assert.equal(isJobExpired({ createdAt: new Date(now - JOB_RETENTION_MS - 1000).toISOString() }, now), true);
  assert.equal(isJobExpired({ createdAt: "invalid" }, now), false);
});

test("public Drive config exposes only the OAuth client identifier", async () => {
  const id = "123456789-abcde.apps.googleusercontent.com";
  const r = await driveConfig({ env: { GOOGLE_DRIVE_CLIENT_ID: id, GOOGLE_DRIVE_CLIENT_SECRET: "never-expose-this" } });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.enabled, true);
  assert.equal(data.clientId, id);
  assert.equal(data.scope, "https://www.googleapis.com/auth/drive.file");
  assert.doesNotMatch(JSON.stringify(data), /never-expose-this/);
});

test("public Drive config stays disabled until an OAuth client is configured", async () => {
  for (const input of [undefined, "not-a-client-id"]) {
    const response = await driveConfig({ env: { GOOGLE_DRIVE_CLIENT_ID: input } });
    assert.equal((await response.json()).enabled, false);
  }
});
