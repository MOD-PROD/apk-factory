// GET /api/runner/file?job=…&name=banner.png|icon.png
// Lu par GitHub Actions pour récupérer les images envoyées. Hors Cloudflare Access :
// protégé par l'en-tête « Authorization: Bearer <CALLBACK_TOKEN> » (rien de secret dans l'adresse,
// donc rien dans les journaux publics des runs). Les images sont effacées après la fabrication.

import { readJob, same } from "../../_shared.js";

export async function onRequestGet({ request, env }) {
  const auth = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!env.CALLBACK_TOKEN || !same(auth, env.CALLBACK_TOKEN)) {
    return new Response("Introuvable", { status: 404 });
  }
  const u = new URL(request.url);
  const name = u.searchParams.get("name") || "";
  const j = await readJob(env, u.searchParams.get("job"));
  if (!j || !(j.files || []).includes(name)) return new Response("Introuvable", { status: 404 });
  const o = await env.FILES.get(`jobs/${j.job}/${name}`);
  if (!o) return new Response("Introuvable", { status: 404 });
  return new Response(o.body, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
}
