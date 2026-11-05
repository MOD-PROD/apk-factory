import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as createProbe, onRequestDelete as deleteProbe } from "../functions/api/runner/selftest.js";
import { onRequestPost as uploadApk } from "../functions/api/runner/upload.js";
import { onRequestGet as downloadApk } from "../functions/api/runner/dl.js";

const TOKEN = "r2-test-secret";
const auth = new Headers({ authorization: `Bearer ${TOKEN}` });

function storage() {
  const objects = new Map();
  const env = {
    CALLBACK_TOKEN: TOKEN,
    FILES: {
      async put(k, data) { objects.set(k, typeof data === "string" ? data : new Uint8Array(data)); },
      async get(k) {
        if (!objects.has(k)) return null;
        const value = objects.get(k);
        return {
          size: typeof value === "string" ? Buffer.byteLength(value) : value.byteLength,
          body: value,
          async json() { return JSON.parse(value); }
        };
      },
      async delete(k) { objects.delete(k); }
    }
  };
  return { env, objects };
}

test("authenticated temporary R2 job accepts signed-APK-shaped bytes and downloads identical content", async () => {
  const { env, objects } = storage();
  const create = await createProbe({ request: { headers: auth }, env });
  assert.equal(create.status, 201);
  const { job, dlKey } = await create.json();
  assert.match(job, /^\d{8}-\d{4}-[0-9a-f]{6}$/);
  const content = Uint8Array.of(80, 75, 3, 4, 10, 20, 30, 40);
  const upload = await uploadApk({
    env,
    request: {
      url: `https://apk-factory.modprod.app/api/runner/upload?job=${job}&name=smoke.apk`,
      headers: auth,
      async arrayBuffer() { return content.buffer; }
    }
  });
  assert.equal(upload.status, 200);
  assert.equal((await upload.json()).status, "done");
  const forbidden = await downloadApk({
    env, request: { url: `https://apk-factory.modprod.app/api/runner/dl?job=${job}&k=wrong` }
  });
  assert.equal(forbidden.status, 404);
  const download = await downloadApk({
    env, request: { url: `https://apk-factory.modprod.app/api/runner/dl?job=${job}&k=${dlKey}` }
  });
  assert.equal(download.status, 200);
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), content);
  assert.equal(download.headers.get("cache-control"), "no-store");
  const cleanup = await deleteProbe({ env, request: { headers: auth, async json() { return { job }; } } });
  assert.equal(cleanup.status, 200);
  assert.equal(objects.size, 0);
});

test("temporary job provisioning denies unauthenticated access", async () => {
  const { env, objects } = storage();
  const response = await createProbe({ env, request: { headers: new Headers() } });
  assert.equal(response.status, 401);
  assert.equal(objects.size, 0);
});

test("temporary cleanup cannot delete a normal user build", async () => {
  const { env, objects } = storage();
  const job = "20261105-1230-a1b2c3";
  objects.set(`jobs/${job}/job.json`, JSON.stringify({ job, status: "done", apkName: "normal.apk" }));
  const response = await deleteProbe({ env, request: { headers: auth, async json() { return { job }; } } });
  assert.equal(response.status, 404);
  assert.equal(objects.size, 1);
});
