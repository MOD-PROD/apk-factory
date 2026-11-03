// GET /api/runner/file?job=…&k=…&name=banner.png|icon.png
// Lu par GitHub Actions pour récupérer les images envoyées. Hors Cloudflare Access :
// protégé par la clé aléatoire de la tâche, et les images sont effacées après la fabrication.

import { readJob, same } from "../../_shared.js";

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const name = u.searchParams.get("name") || "";
  const j = await readJob(env, u.searchParams.get("job"));
  if (!j || !same(u.searchParams.get("k"), j.fileKey) || !(j.files || []).includes(name)) {
    return new Response("Introuvable", { status: 404 });
  }
  const o = await env.FILES.get(`jobs/${j.job}/${name}`);
  if (!o) return new Response("Introuvable", { status: 404 });
  return new Response(o.body, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
}
