// GET /api/runner/file?job=…&name=banner.png|icon.png|index.html|app.zip|config.js
// Lu par GitHub Actions pour récupérer les fichiers envoyés depuis le site. Hors Cloudflare Access :
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
  const type = name.endsWith(".png") ? "image/png" : "application/octet-stream";
  return new Response(o.body, { headers: { "content-type": type, "cache-control": "no-store" } });
}
