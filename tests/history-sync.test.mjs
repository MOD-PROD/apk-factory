import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeHistory, mergeHistory } from "../history-sync.js";
import { prepareGoogleDrive, syncHistoryWithGoogleDrive } from "../drive-backup.js";

const stamp = new Date().toISOString();
const jobA = "20261105-1410-a1b2c3";
const jobB = "20261105-1411-d4e5f6";
const keyA = "a".repeat(48);
const local = [{ job: jobA, statusKey: keyA, createdAt: stamp,
  appName: "My APK", packageName: "app.modprod.mine",
  form: "web", status: "done", apk: { url: "https://private.example/download" } }];

test("Drive manifest whitelist excludes download URLs and OAuth credentials", () => {
  const clean = sanitizeHistory(local);
  assert.equal(clean.length, 1);
  assert.equal(clean[0].statusKey, keyA);
  assert.equal(clean[0].apk, undefined);
  assert.doesNotMatch(JSON.stringify(clean), /private\.example|access_token/);
  assert.equal(sanitizeHistory([{ job: "invalid", createdAt: stamp }]).length, 0);
});

test("merging Drive history restores remote-only jobs and preserves capability keys", () => {
  const remote = [{ job: jobB, createdAt: stamp, statusKey: "b".repeat(48),
    appName: "TV", form: "atv", status: "done" }];
  const merged = mergeHistory(local, remote);
  assert.equal(merged.length, 2);
  assert.equal(merged.find(j => j.job === jobA).statusKey, keyA);
  assert.equal(merged.find(j => j.job === jobB).statusKey, "b".repeat(48));
});

function mockDrive(remoteFile = null) {
  const oldFetch = globalThis.fetch, oldGoogle = globalThis.google;
  const calls = [];
  let data = remoteFile;
  globalThis.google = { accounts: { oauth2: { initTokenClient(opts) {
    return { requestAccessToken() { opts.callback({ access_token: "fake-google-token" }); } };
  } } } };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u === "api/drive/config") {
      assert.equal(init.headers?.Authorization, undefined);
      return Response.json({ enabled: true, clientId: "1234-test.apps.googleusercontent.com" });
    }
    assert.equal(init.headers?.Authorization, "Bearer fake-google-token");
    if (init.method === "PUT" && u.includes("upload_id=test")) {
      data = await init.body.text();
      return Response.json({ id: "history-id" });
    }
    if (init.method === "PATCH" && u.includes("uploadType=media")) {
      data = await init.body.text();
      return Response.json({ id: "history-id" });
    }
    if (u.includes("alt=media")) {
      return new Response(data, { headers: { "Content-Type": "application/json" } });
    }
    if (u.includes("uploadType=resumable")) {
      return new Response(null, { status: 200,
        headers: { Location: "https://www.googleapis.com/upload/drive/v3/files?upload_id=test" } });
    }
    if (init.method === "POST") {
      const payload = JSON.parse(init.body);
      if (payload.name === "ModProd") return Response.json({ id: "folder-modprod" });
      if (payload.name === "APK Factory") return Response.json({ id: "folder-apkfactory" });
      throw new Error("Unexpected metadata " + payload.name);
    }
    if (u.includes("pageSize=25")) return Response.json({ files: [] });
    if (u.includes("pageSize=20")) return Response.json({
      files: data == null ? [] : [{
        id: "history-id", name: "historique.json", mimeType: "application/json",
        size: String(data.length)
      }]
    });
    throw new Error("Unexpected Google URL " + u);
  };
  return { calls, restore() { globalThis.fetch = oldFetch; globalThis.google = oldGoogle; } };
}

test("first sync writes only sanitized personal Drive history; next sync restores remote data", async () => {
  const remote = mockDrive();
  try {
    await prepareGoogleDrive();
    const synced = await syncHistoryWithGoogleDrive(local);
    assert.equal(synced.length, 1);
    assert.equal(synced[0].statusKey, keyA);
    const storageCalls = remote.calls.filter(c => c.url === "api/drive/config");
    assert.equal(storageCalls.length, 1);
    assert.ok(remote.calls.every(c => !c.url.startsWith("https://apk-factory.modprod.app/api/build")));
    const restored = await syncHistoryWithGoogleDrive([]);
    assert.equal(restored.length, 1);
    assert.equal(restored[0].statusKey, keyA);
  } finally { remote.restore(); }
});

test("bad Drive manifest is never overwritten", async () => {
  const remote = mockDrive(JSON.stringify({ schema: "unknown-schema", jobs: [] }));
  try {
    await prepareGoogleDrive();
    await assert.rejects(syncHistoryWithGoogleDrive(local), /inconnu/);
    assert.equal(remote.calls.some(c => c.init.method === "PATCH"), false);
  } finally { remote.restore(); }
});
