// POST /api/build — reçoit le formulaire (multipart), range les images dans R2,
// puis lance le workflow GitHub « Fabriquer une appli ». Réponse : { job }.
// Protégé par Cloudflare Access (tout le site sauf /api/runner).

import { json, site, repo, gh, newJobId, randomHex, writeJob, checkPackage, pngSize, WORKFLOW, SIGNING } from "../_shared.js";

const MAX_IMAGE = 2 * 1024 * 1024; // 2 Mo par image

function text(form, name, max = 300) {
  const v = form.get(name);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

async function image(form, name, label, errors, expect) {
  const f = form.get(name);
  if (!f || typeof f === "string" || !f.size) return null;
  if (f.size > MAX_IMAGE) { errors.push(`${label} : 2 Mo maximum.`); return null; }
  const buf = await f.arrayBuffer();
  const size = pngSize(buf);
  if (!size) { errors.push(`${label} : image PNG attendue.`); return null; }
  if (expect && (size.w !== expect.w || size.h !== expect.h)) {
    errors.push(`${label} : ${size.w} × ${size.h} px, il faut ${expect.w} × ${expect.h} px.`);
    return null;
  }
  return buf;
}

export async function onRequestPost({ request, env }) {
  if (!env.FILES || !env.GITHUB_TOKEN) {
    return json({ error: "Site mal configuré : liaison R2 « FILES » ou secret « GITHUB_TOKEN » manquant." }, 500);
  }
  let form;
  try { form = await request.formData(); } catch { return json({ error: "Formulaire illisible." }, 400); }

  const type = text(form, "type", 20);
  const errors = [];
  if (type !== "atv") errors.push("Seul le type « Lanceur TV » est disponible pour l'instant.");

  const appName = text(form, "appName", 50);
  const packageName = text(form, "packageName", 150);
  const versionName = text(form, "versionName", 50) || "1.0.0";
  const versionCode = text(form, "versionCode", 10) || "1";
  const mode = text(form, "mode", 20) || "url";
  const targetUrl = text(form, "targetUrl", 2000);
  const targetApk = text(form, "targetApk", 150);
  const isGame = text(form, "isGame", 5) === "true";

  if (!appName) errors.push("Nom du lanceur obligatoire.");
  checkPackage(packageName, errors);
  if (!/^[0-9A-Za-z._+-]{1,50}$/.test(versionName)) errors.push("Version (nom) : lettres, chiffres et . _ + - seulement.");
  if (!/^\d{1,10}$/.test(versionCode) || +versionCode < 1 || +versionCode > 2100000000) errors.push("Version (code) : nombre entier positif.");
  if (!["url", "apk", "apkToUrl"].includes(mode)) errors.push("Action au lancement inconnue.");
  if (mode !== "apk") {
    if (!targetUrl) errors.push("Lien cible obligatoire.");
    else if (!/^(https:\/\/|intent:\/\/)\S+$/.test(targetUrl)) errors.push("Le lien cible doit commencer par https:// ou intent://.");
  }
  if (mode !== "url") {
    if (!targetApk) errors.push("Package de l'appli cible obligatoire.");
    else if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(targetApk)) errors.push(`Package cible « ${targetApk} » invalide.`);
  }
  const banner = await image(form, "banner", "Bannière TV", errors, { w: 320, h: 180 });
  const icon = await image(form, "icon", "Icône", errors);
  if (errors.length) return json({ errors }, 400);

  const job = newJobId();
  const fileKey = randomHex(16);   // lu par GitHub pour récupérer les images
  const dlKey = randomHex(16);     // lien de téléchargement de l'APK (QR code)
  const base = `${site(env)}/api/runner/file?job=${job}&k=${fileKey}&name=`;

  if (banner) await env.FILES.put(`jobs/${job}/banner.png`, banner, { httpMetadata: { contentType: "image/png" } });
  if (icon) await env.FILES.put(`jobs/${job}/icon.png`, icon, { httpMetadata: { contentType: "image/png" } });

  const data = {
    job, type, status: "queued", createdAt: new Date().toISOString(), signing: SIGNING,
    appName, packageName, versionName, versionCode: +versionCode, mode, targetUrl, targetApk, isGame,
    fileKey, dlKey, files: [banner && "banner.png", icon && "icon.png"].filter(Boolean),
  };
  await writeJob(env, data);

  const inputs = {
    type, app_name: appName, package_name: packageName, version_name: versionName, version_code: versionCode,
    atv_mode: mode, atv_target_url: mode === "apk" ? "" : targetUrl, atv_target_apk: mode === "url" ? "" : targetApk,
    atv_is_game: isGame ? "true" : "false",
    banner_url: banner ? base + "banner.png" : "", icon_url: icon ? base + "icon.png" : "",
    job_id: job,
  };
  const r = await gh(env, `/repos/${repo(env)}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST", body: JSON.stringify({ ref: "main", inputs }),
  });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    data.status = "failed";
    data.error = `GitHub a refusé le lancement (${r.status}). ${detail}`;
    await writeJob(env, data);
    return json({ job, error: data.error }, 502);
  }
  return json({ job, status: "queued" });
}
