// Authenticated and temporary R2 end-to-end probe for GitHub Actions.
// No user job is ever modified. Both methods require the shared CALLBACK_TOKEN.

import { json, newJobId, randomHex, readJob, writeJob, same } from "../../_shared.js";

function authorized(request, env) {
  const authorization = request.headers.get("authorization") || "";
  return Boolean(env.CALLBACK_TOKEN && same(authorization.replace(/^Bearer\\s+/i, ""), env.CALLBACK_TOKEN));
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return json({ error: "Non autorisé." }, 401);
  if (!env.FILES) return json({ error: "Stockage R2 indisponible." }, 503);
  const job = newJobId();
  const dlKey = randomHex(24);
  await writeJob(env, {
    job, dlKey, status: "queued", type: "html", smokeTest: true, files: [],
    createdAt: new Date().toISOString(),
  });
  return json({ job, dlKey }, 201);
}

export async function onRequestDelete({ request, env }) {
  if (!authorized(request, env)) return json({ error: "Non autorisé." }, 401);
  if (!env.FILES) return json({ error: "Stockage R2 indisponible." }, 503);
  let data;
  try { data = await request.json(); } catch { return json({ error: "JSON invalide." }, 400); }
  const job = await readJob(env, data?.job);
  if (!job || job.smokeTest !== true) return json({ error: "Tâche temporaire inconnue." }, 404);
  if (job.apkName) await env.FILES.delete(`jobs/${job.job}/${job.apkName}`);
  for (const name of job.files || []) await env.FILES.delete(`jobs/${job.job}/${name}`);
  await env.FILES.delete(`jobs/${job.job}/job.json`);
  return json({ ok: true });
}
