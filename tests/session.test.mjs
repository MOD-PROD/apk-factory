import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { onRequestGet } from "../functions/api/session.js";

const TEAM = "apkfactorytest";
const AUD = "apk-factory-audience-test";
const env = { ACCESS_TEAM: TEAM, ACCESS_AUD: AUD };
const b64 = value => Buffer.from(value).toString("base64url");
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = pair.publicKey.export({ format: "jwk" });
jwk.kid = "test-key";
jwk.alg = "RS256";
jwk.use = "sig";

function token({ audience = AUD, expiration = Math.floor(Date.now() / 1000) + 300, alg = "RS256" } = {}) {
  const header = b64(JSON.stringify({ typ: "JWT", alg, kid: "test-key" }));
  const payload = b64(JSON.stringify({ iss: `https://${TEAM}.cloudflareaccess.com`, aud: [audience], exp: expiration }));
  const signature = sign("RSA-SHA256", Buffer.from(header + "." + payload), pair.privateKey).toString("base64url");
  return header + "." + payload + "." + signature;
}
const request = jwt => ({ headers: new Headers(jwt ? { "Cf-Access-Jwt-Assertion": jwt } : {}) });

test("session diagnostic fails closed when Access is unconfigured", async () => {
  const response = await onRequestGet({ request: request(), env: {} });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).authenticated, false);
});

test("session diagnostic rejects missing Cloudflare Access assertion", async () => {
  const response = await onRequestGet({ request: request(), env });
  assert.equal(response.status, 401);
});

test("session diagnostic verifies signed Access JWT and rejects mismatched audiences", async () => {
  const saved = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(url, `https://${TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`);
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
  };
  try {
    const ok = await onRequestGet({ request: request(token()), env });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).authenticated, true);
    const wrongAud = await onRequestGet({ request: request(token({ audience: "other" })), env });
    assert.equal(wrongAud.status, 401);
    const expired = await onRequestGet({ request: request(token({ expiration: 1 })), env });
    assert.equal(expired.status, 401);
    const badAlg = await onRequestGet({ request: request(token({ alg: "none" })), env });
    assert.equal(badAlg.status, 401);
    const tampered = token().replace(/.$/, x => x === "a" ? "b" : "a");
    const badSignature = await onRequestGet({ request: request(tampered), env });
    assert.equal(badSignature.status, 401);
  } finally {
    globalThis.fetch = saved;
  }
});
