// POST /api/runner/upload?job=…&name=<fichier.apk>   (corps = l'APK signé)
// POST /api/runner/upload?job=…&status=failed        (corps = message d'erreur, texte)
// Appelé par GitHub Actions à la fin de « Fabriquer une appli ». Hors Cloudflare Access :
// protégé par l'en-tête « Authorization: Bearer <CALLBACK_TOKEN> ».

import { json, readJob, writeJob, same } from "../../_shared.js";

const MAX_APK = 95 * 1024 * 1024;

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get("authorization") || "";
  if (!env.CALLBACK_TOKEN || !same(auth.replace(/^Bearer\s+/i, ""), env.CALLBACK_TOKEN)) {
    return json({ error: "Non autorisé." }, 401);
  }
  const u = new URL(request.url);
  const j = await readJob(env, u.searchParams.get("job"));
  if (!j) return json({ error: "Tâche inconnue." }, 404);

  if (u.searchParams.get("status") === "failed") {
    j.status = "failed";
    j.error = ((await request.text()) || "La fabrication a échoué.").slice(0, 500);
    j.runUrl = u.searchParams.get("run") || j.runUrl;
  } else {
    const name = u.searchParams.get("name") || "";
    if (!/^[A-Za-z0-9._-]{1,150}\.apk$/.test(name)) return json({ error: "Nom de fichier invalide." }, 400);
    const len = +(request.headers.get("content-length") || 0);
    if (len > MAX_APK) return json({ error: "APK trop gros." }, 413);
    const buf = await request.arrayBuffer();
    if (!buf.byteLength || new Uint8Array(buf, 0, 2).join() !== "80,75") { // « PK » : archive zip
      return json({ error: "Le fichier reçu n'est pas un APK." }, 400);
    }
    await env.FILES.put(`jobs/${j.job}/${name}`, buf, {
      httpMetadata: { contentType: "application/vnd.android.package-archive" },
    });
    j.status = "done";
    j.apkName = name;
    j.apkSize = buf.byteLength;
    j.certSha256 = (u.searchParams.get("cert") || "").replace(/[^0-9a-f]/gi, "").slice(0, 64) || null;
    j.runUrl = u.searchParams.get("run") || j.runUrl;
    j.error = null;
  }
  // Les images envoyées ne servent plus.
  for (const f of j.files || []) await env.FILES.delete(`jobs/${j.job}/${f}`);
  j.files = [];
  j.step = null;
  await writeJob(env, j);
  return json({ ok: true, status: j.status });
}
