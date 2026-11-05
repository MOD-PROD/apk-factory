import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost as startBuild } from "../functions/api/build.js";
import { onRequestGet as getRunnerFile } from "../functions/api/runner/file.js";

const TOKEN = "runner-test-token";

function setup() {
  const objects = new Map();
  const env = {
    GITHUB_TOKEN: "github-test-token",
    CALLBACK_TOKEN: TOKEN,
    FILES: {
      async put(key, value) { objects.set(key, value); },
      async get(key) {
        const item = objects.get(key);
        if (item == null) return null;
        return {
          body: typeof item === "string" ? item : item,
          async json() { return JSON.parse(item); }
        };
      },
      async delete(key) { objects.delete(key); }
    }
  };
  return { env, objects };
}

function formForHtml() {
  const form = new FormData();
  form.set("type", "html");
  form.set("appName", "Integration Test");
  form.set("packageName", "app.modprod.integrationtest");
  form.set("versionName", "1.2.3");
  form.set("versionCode", "12");
  form.set("bundle", new File(["<!doctype html><html><body>OK</body></html>"], "index.html", { type: "text/html" }));
  return form;
}

test("HTML form stores input in R2, dispatches GitHub and allows authorized file retrieval", async () => {
  const ctx = setup();
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(null, { status: 204 });
  };
  try {
    const response = await startBuild({
      env: ctx.env,
      request: { async formData() { return formForHtml(); } }
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.match(data.job, /^\d{8}-\d{4}-[0-9a-f]{6}$/);
    assert.equal(data.status, "queued");
    const job = JSON.parse(ctx.objects.get(`jobs/${data.job}/job.json`));
    assert.equal(job.type, "html");
    assert.equal(job.bundleName, "index.html");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/actions\/workflows\/build-app\.yml\/dispatches$/);
    const dispatch = JSON.parse(calls[0].options.body);
    assert.equal(dispatch.ref, "main");
    assert.equal(dispatch.inputs.job_id, data.job);
    assert.equal(dispatch.inputs.package_name, "app.modprod.integrationtest");
    assert.match(dispatch.inputs.html_url, /\/api\/runner\/file\?job=/);
    const base = `https://apk-factory.modprod.app/api/runner/file?job=${data.job}&name=index.html`;
    const unauthorized = await getRunnerFile({ env: ctx.env, request: { url: base, headers: new Headers() } });
    assert.equal(unauthorized.status, 404);
    const authorized = await getRunnerFile({
      env: ctx.env,
      request: { url: base, headers: new Headers({ authorization: `Bearer ${TOKEN}` }) }
    });
    assert.equal(authorized.status, 200);
    assert.match(await authorized.text(), /<html>/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("invalid HTML build is rejected before R2 writes or GitHub dispatch", async () => {
  const ctx = setup();
  const form = formForHtml();
  form.set("packageName", "Not a valid package");
  const response = await startBuild({ env: ctx.env, request: { async formData() { return form; } } });
  assert.equal(response.status, 400);
  assert.ok((await response.json()).errors.length > 0);
  assert.equal(ctx.objects.size, 0);
});
