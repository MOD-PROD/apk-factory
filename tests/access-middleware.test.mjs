import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/_middleware.js";

function setup({ path = "/api/build", env = {}, headers = new Headers(), host = "apk-factory.modprod.app" } = {}) {
  let called = 0;
  const request = { url: `https://${host}${path}`, headers };
  const next = () => { called++; return new Response("ok"); };
  return { request, env, next, get called() { return called; } };
}

test("origin pages.dev is redirected before accessing private APIs", async () => {
  const ctx = setup({ host: "apk-factory.pages.dev" });
  const res = await onRequest(ctx);
  assert.equal(res.status, 308);
  assert.equal(res.headers.get("location"), "https://apk-factory.modprod.app/api/build");
  assert.equal(ctx.called, 0);
});

test("Access-configured build and status endpoints reject a missing assertion", async () => {
  for (const path of ["/api/build", "/api/status"]) {
    const ctx = setup({ path, env: { ACCESS_TEAM: "testteam", ACCESS_AUD: "testaud" } });
    const res = await onRequest(ctx);
    assert.equal(res.status, 401);
    assert.equal(ctx.called, 0);
  }
});

test("partially configured Access rejects private API without weakening security", async () => {
  const ctx = setup({ env: { ACCESS_TEAM: "testteam" } });
  const res = await onRequest(ctx);
  assert.equal(res.status, 503);
  assert.equal(ctx.called, 0);
});

test("legacy access control remains with Cloudflare edge when no extra settings exist", async () => {
  const ctx = setup();
  const res = await onRequest(ctx);
  assert.equal(res.status, 200);
  assert.equal(ctx.called, 1);
});

test("callback runner route is not mistakenly gated by user login", async () => {
  const ctx = setup({ path: "/api/runner/upload", env: { ACCESS_TEAM: "testteam", ACCESS_AUD: "testaud" } });
  const res = await onRequest(ctx);
  assert.equal(res.status, 200);
  assert.equal(ctx.called, 1);
});
