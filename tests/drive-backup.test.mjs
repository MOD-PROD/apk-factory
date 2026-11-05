import test from "node:test";
import assert from "node:assert/strict";
import { prepareGoogleDrive, saveApkToGoogleDrive } from "../drive-backup.js";

const NAME = "app.modprod.integration-1.0.apk";
const APK_URL = "https://apk-factory.modprod.app/api/runner/dl?job=20261105-1430-a1b2c3&k=example";
const DATA = new Uint8Array([80,75,3,4,1,2,3,4]);
const config = { enabled: true, clientId: "123456789-client.apps.googleusercontent.com" };
const json = (value, init = {}) => new Response(JSON.stringify(value), {
  status: init.status || 200,
  headers: { "Content-Type": "application/json", ...(init.headers || {}) }
});

function mocks({ wrongSize = false, googleFailure = false, payload = DATA } = {}) {
  const requests = [];
  const oldFetch = globalThis.fetch, oldGoogle = globalThis.google;
  globalThis.google = {
    accounts: {
      oauth2: {
        initTokenClient(opts) {
          assert.equal(opts.scope, "https://www.googleapis.com/auth/drive.file");
          return { requestAccessToken() { opts.callback({ access_token: "test-oauth-token" }); } };
        }
      }
    }
  };
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    requests.push({ url: target, options });
    if (target === "api/drive/config") {
      assert.ok(!options.headers?.Authorization, "OAuth token should not reach ModProd");
      return json(config);
    }
    if (target === APK_URL) {
      assert.ok(!options.headers?.Authorization, "OAuth token should not reach Cloudflare");
      return new Response(payload, { headers: { "Content-Type": "application/vnd.android.package-archive" } });
    }
    assert.equal(options.headers?.Authorization, "Bearer test-oauth-token");
    if (target.includes("uploadType=resumable") && options.method === "POST") {
      return new Response(null, {
        status: 200, headers: { Location: "https://www.googleapis.com/upload/drive/v3/files?upload_id=mock" }
      });
    }
    if (target.includes("upload_id=mock") && options.method === "PUT") {
      if (googleFailure) return json({ error: { message: "Upload refused" } }, { status: 500 });
      assert.ok(options.body.size <= 8 * 1024 * 1024);
      const header = options.headers["Content-Range"];
      assert.ok(header.startsWith("bytes "), "Content-Range required");
      const [range, total] = header.slice(6).split("/");
      const [first, last] = range.split("-");
      const begin = Number(first), end = Number(last);
      assert.ok(Number.isSafeInteger(begin) && Number.isSafeInteger(end));
      assert.equal(Number(total), payload.length);
      assert.equal(options.body.size, end - begin + 1);
      if (end + 1 < payload.length) {
        return new Response(null, { status: 308, headers: { Range: "bytes=0-" + end } });
      }
      return json({ id: "apk-123" });
    }
    if (target.includes("/apk-123?")) {
      return json({
        id: "apk-123", name: NAME, size: String(payload.length - (wrongSize ? 1 : 0)),
        parents: ["folder-apkfactory"], webViewLink: "https://drive.google.com/file/d/apk-123/view"
      });
    }
    if (target.includes("mimeType") || target.includes("pageSize")) return json({ files: [] });
    if (options.method === "POST" && target.startsWith("https://www.googleapis.com/drive/v3/files?")) {
      const metadata = JSON.parse(options.body);
      if (metadata.name === "ModProd") return json({ id: "folder-modprod" });
      if (metadata.name === "APK Factory") {
        assert.deepEqual(metadata.parents, ["folder-modprod"]);
        return json({ id: "folder-apkfactory" });
      }
    }
    throw new Error("Unexpected request: " + target);
  };
  return {
    requests,
    restore() { globalThis.fetch = oldFetch; globalThis.google = oldGoogle; }
  };
}

test("direct browser-to-Google backup verifies the returned Drive file without exposing OAuth to Cloudflare", async () => {
  const mock = mocks();
  try {
    await prepareGoogleDrive();
    const saved = await saveApkToGoogleDrive({ name: NAME, url: APK_URL, size: DATA.length });
    assert.equal(saved.id, "apk-123");
    assert.match(saved.link, /drive\.google\.com/);
    assert.equal(mock.requests.filter(x => x.url === APK_URL).length, 1);
    assert.equal(mock.requests.filter(x => x.options.method === "PUT").length, 1);
  } finally { mock.restore(); }
});

test("backup rejects mismatched Drive size rather than reporting success", async () => {
  const mock = mocks({ wrongSize: true });
  try {
    await prepareGoogleDrive();
    await assert.rejects(saveApkToGoogleDrive({ name: NAME, url: APK_URL, size: DATA.length }), /vérifiée/);
  } finally { mock.restore(); }
});

test("backup reports Drive error and leaves temporary APK untouched", async () => {
  const mock = mocks({ googleFailure: true });
  try {
    await prepareGoogleDrive();
    await assert.rejects(saveApkToGoogleDrive({ name: NAME, url: APK_URL, size: DATA.length }), /HTTP 500/);
    assert.ok(!mock.requests.some(r => r.url.includes("delete") || r.options.method === "DELETE"));
  } finally { mock.restore(); }
});


test("large APK uploads in independently acknowledged 8 MiB chunks", async () => {
  const payload = new Uint8Array(8 * 1024 * 1024 + 37);
  payload.set([80, 75, 3, 4]);
  const mock = mocks({ payload });
  try {
    await prepareGoogleDrive();
    const saved = await saveApkToGoogleDrive({ name: NAME, url: APK_URL, size: payload.length });
    assert.equal(saved.id, "apk-123");
    const chunks = mock.requests.filter(req => req.options.method === "PUT");
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].options.body.size, 8 * 1024 * 1024);
    assert.equal(chunks[1].options.body.size, 37);
    assert.equal(chunks[1].options.headers["Content-Range"],
      "bytes " + (8 * 1024 * 1024) + "-" + (payload.length - 1) + "/" + payload.length);
  } finally { mock.restore(); }
});
