// GET /api/runner/dl?job=…&k=…  — téléchargement direct de l'APK (lien et QR code).
// Hors Cloudflare Access pour que Downloader sur la TV puisse l'ouvrir sans connexion :
// protégé par la clé aléatoire de la tâche. Les fichiers sont effacés par la règle de cycle de vie R2.

import { readJob, same } from "../../_shared.js";

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const j = await readJob(env, u.searchParams.get("job"));
  if (!j || j.status !== "done" || !same(u.searchParams.get("k"), j.dlKey)) {
    return new Response("Lien expiré ou invalide.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const o = await env.FILES.get(`jobs/${j.job}/${j.apkName}`);
  if (!o) return new Response("Fichier expiré.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(o.body, {
    headers: {
      "content-type": "application/vnd.android.package-archive",
      "content-disposition": `attachment; filename="${j.apkName}"`,
      "content-length": String(o.size),
      "cache-control": "no-store",
    },
  });
}
