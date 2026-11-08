// POST /api/build — reçoit le formulaire (multipart), range les images dans R2,
// puis lance le workflow GitHub « Fabriquer une appli ». Réponse : { job }.
// Protégé par Cloudflare Access (tout le site sauf /api/runner).

import { json, site, repo, gh, newJobId, randomHex, writeJob, checkPackage, pngSize, WORKFLOW, SIGNING } from "../_shared.js";

const MAX_IMAGE = 2 * 1024 * 1024;    // 2 Mo par image
const MAX_BUNDLE = 30 * 1024 * 1024;  // 30 Mo pour la page / l'archive de l'appli

// Fichier envoyé (page, archive, config) : { buf, zip } ou null.
async function upload(form, name, label, errors, max) {
  const f = form.get(name);
  if (!f || typeof f === "string" || !f.size) return null;
  if (f.size > max) { errors.push(`${label} : ${Math.round(max / 1048576)} Mo maximum.`); return null; }
  const buf = await f.arrayBuffer();
  const b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  return { buf, zip: b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 };
}

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

// Réglages Android (patch « ModProd Réglages ») : seules les valeurs différentes de la base sont envoyées.
const BOOLS = ["fullscreen", "keepScreenOn", "blockScreenshots", "zoom", "scrollBars", "camera", "microphone", "location"];
const COLORS = ["backgroundColor", "barsColor", "accentColor"];
function readReglages(form, errors) {
  const r = {};
  const o = text(form, "orientation", 10) || "portrait";
  if (!["portrait", "auto"].includes(o)) errors.push("Orientation inconnue.");
  else if (o !== "portrait") r.orientation = o;
  const wt = text(form, "webTheme", 10) || "auto";
  if (!["auto", "native", "css", "invert"].includes(wt)) errors.push("Thème WebView inconnu.");
  else if (wt !== "auto") r.webTheme = wt;
  for (const k of BOOLS) if (text(form, k, 5) === "true") r[k] = true;
  for (const k of COLORS) {
    const v = text(form, k, 9);
    if (!v) continue;
    if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(v)) errors.push(`Couleur « ${v} » invalide.`);
    else r[k] = v.toUpperCase();
  }
  return r;
}

export async function onRequestPost({ request, env }) {
  if (!env.FILES || !env.GITHUB_TOKEN) {
    return json({ error: "Site mal configuré : liaison R2 « FILES » ou secret « GITHUB_TOKEN » manquant." }, 500);
  }
  let form;
  try { form = await request.formData(); } catch { return json({ error: "Formulaire illisible." }, 400); }

  const type = text(form, "type", 20);
  const errors = [];
  if (!["atv", "site-web", "html"].includes(type)) errors.push("Type d'appli indisponible pour l'instant.");
  const isTv = type === "atv", isHtml = type === "html";

  const appName = text(form, "appName", 50);
  const packageName = text(form, "packageName", 150);
  const versionName = text(form, "versionName", 50) || "1.0.0";
  const versionCode = text(form, "versionCode", 10) || "1";

  if (!appName) errors.push(isTv ? "Nom du lanceur obligatoire." : "Nom de l'appli obligatoire.");
  checkPackage(packageName, errors);
  if (!/^[0-9A-Za-z._+-]{1,50}$/.test(versionName)) errors.push("Version (nom) : lettres, chiffres et . _ + - seulement.");
  if (!/^\d{1,10}$/.test(versionCode) || +versionCode < 1 || +versionCode > 2100000000) errors.push("Version (code) : nombre entier positif.");

  // Lanceur TV
  const mode = isTv ? (text(form, "mode", 20) || "url") : "url";
  const targetUrl = isTv ? text(form, "targetUrl", 2000) : "";
  const targetApk = isTv ? text(form, "targetApk", 150) : "";
  const isGame = isTv && text(form, "isGame", 5) === "true";
  if (isTv) {
    if (!["url", "apk", "apkToUrl"].includes(mode)) errors.push("Action au lancement inconnue.");
    if (mode !== "apk") {
      if (!targetUrl) errors.push("Lien cible obligatoire.");
      else if (!/^(https:\/\/|intent:\/\/)\S+$/.test(targetUrl)) errors.push("Le lien cible doit commencer par https:// ou intent://.");
    }
    if (mode !== "url") {
      if (!targetApk) errors.push("Package de l'appli cible obligatoire.");
      else if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(targetApk)) errors.push(`Package cible « ${targetApk} » invalide.`);
    }
  }

  // Site web / fichiers HTML
  const webUrl = isTv || isHtml ? "" : text(form, "webUrl", 2000);
  let reglages = {}, bundle = null, config = null;
  if (isHtml) {
    bundle = await upload(form, "bundle", "Page HTML / archive .zip", errors, MAX_BUNDLE);
    if (bundle && !bundle.zip && !/<html|<!doctype/i.test(new TextDecoder().decode(bundle.buf.slice(0, 4096)))) {
      errors.push("Le fichier n'est ni une page .html ni une archive .zip.");
      bundle = null;
    }
    config = await upload(form, "config", "config.js", errors, 1024 * 1024);
    if (!bundle && !errors.length) errors.push("Page .html ou archive .zip obligatoire.");
  }
  if (!isTv) {
    if (isHtml) { /* pas d'adresse */ }
    else if (!webUrl) errors.push("Adresse du site obligatoire.");
    else {
      try {
        const u = new URL(webUrl);
        if (u.protocol !== "https:" || !u.hostname.includes(".")) throw 0;
      } catch { errors.push("Adresse du site : https://… attendue (Android bloque le http:// non chiffré)."); }
    }
    reglages = readReglages(form, errors);
  }

  const banner = isTv ? await image(form, "banner", "Bannière TV", errors, { w: 320, h: 180 }) : null;
  const icon = await image(form, "icon", "Icône", errors);
  if (errors.length) return json({ errors }, 400);

  const job = newJobId();
  const dlKey = randomHex(16);
  const statusKey = randomHex(24);
  const base = `${site(env)}/api/runner/file?job=${job}&name=`;

  if (banner) await env.FILES.put(`jobs/${job}/banner.png`, banner, { httpMetadata: { contentType: "image/png" } });
  if (icon) await env.FILES.put(`jobs/${job}/icon.png`, icon, { httpMetadata: { contentType: "image/png" } });
  const bundleName = bundle ? (bundle.zip ? "app.zip" : "index.html") : null;
  if (bundle) await env.FILES.put(`jobs/${job}/${bundleName}`, bundle.buf);
  if (config) await env.FILES.put(`jobs/${job}/config.js`, config.buf);

  const data = {
    job, type, status: "queued", createdAt: new Date().toISOString(), signing: SIGNING,
    appName, packageName, versionName, versionCode: +versionCode,
    ...(isTv ? { mode, targetUrl, targetApk, isGame } : { webUrl, reglages, bundleName, bundleSize: bundle ? bundle.buf.byteLength : 0 }),
    dlKey, statusKey, files: [banner && "banner.png", icon && "icon.png", bundleName, config && "config.js"].filter(Boolean),
  };
  await writeJob(env, data);

  const inputs = {
    type, app_name: appName, package_name: packageName, version_name: versionName, version_code: versionCode,
    icon_url: icon ? base + "icon.png" : "", job_id: job,
    ...(isTv ? {
      atv_mode: mode, atv_target_url: mode === "apk" ? "" : targetUrl, atv_target_apk: mode === "url" ? "" : targetApk,
      atv_is_game: isGame ? "true" : "false", banner_url: banner ? base + "banner.png" : "",
    } : {
      reglages: Object.keys(reglages).length ? JSON.stringify(reglages) : "",
      ...(isHtml ? { html_url: base + bundleName, config_url: config ? base + "config.js" : "" } : { web_url: webUrl }),
    }),
  };
  const r = await gh(env, `/repos/${repo(env)}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST", body: JSON.stringify({ ref: "main", inputs }),
  });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    data.status = "failed";
    data.error = `GitHub a refusé le lancement (${r.status}). ${detail}`;
    await writeJob(env, data);
    return json({ job, statusKey, error: data.error }, 502);
  }
  return json({ job, statusKey, status: "queued" });
}
