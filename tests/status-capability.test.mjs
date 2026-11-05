import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/status.js";

const job = "20261105-1340-a1b2c3";
const key = "a".repeat(48);
const env = { FILES: { async get() { return { async json() {
  return { job, statusKey: key, dlKey: "b".repeat(32), status: "done",
    createdAt: new Date().toISOString(), apkName: "private.apk", apkSize: 4 };
} }; } } };
const req = secret => ({ async json() { return { job, statusKey: secret }; } });

test("no status or download URL without the private build key", async () => {
  for (const secret of [undefined, "", "other"]) {
    const response = await onRequestPost({ request: req(secret), env });
    assert.equal(response.status, 404);
  }
  const valid = await onRequestPost({ request: req(key), env });
  assert.equal(valid.status, 200);
  const body = await valid.json();
  assert.equal(body.apk.name, "private.apk");
  assert.equal(body.statusKey, undefined);
});
