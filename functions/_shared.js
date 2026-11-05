// Outils communs aux fonctions de l'APK Factory (pas une route : aucun gestionnaire exporté).
//
// Liaisons et secrets du projet Cloudflare Pages :
//   FILES           bucket R2 « apk-factory » (fichiers envoyés, APK, état des tâches)
//   GITHUB_TOKEN    jeton GitHub (Actions : lecture/écriture sur MOD-PROD/apk-factory)
//   CALLBACK_TOKEN  phrase secrète partagée avec GitHub (retour de l'APK)
// Facultatif (tests) : GITHUB_API, SITE_URL, GITHUB_REPO.

export const REPO = "MOD-PROD/apk-factory";
export const WORKFLOW = "build-app.yml";
export const SITE = "https://apk-factory.modprod.app";

// Clé de signature utilisée par le workflow. Plus tard : « utilisateur » (une clé par compte) ou « test ».
export const SIGNING = "modprod";

export const JAVA_RESERVED = new Set(("abstract assert boolean break byte case catch char class const continue default do double " +
  "else enum extends false final finally float for goto if implements import instanceof int interface long native new " +
  "null package private protected public return short static strictfp super switch synchronized this throw throws " +
  "transient true try void volatile while var record yield sealed permits _").split(" "));

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function site(env) { return (env.SITE_URL || SITE).replace(/\/$/, ""); }
export function api(env) { return (env.GITHUB_API || "https://api.github.com").replace(/\/$/, ""); }
export function repo(env) { return env.GITHUB_REPO || REPO; }

export function randomHex(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Identifiant de tâche lisible et court : date + hasard (ex. 20261103-1432-a1b2c3).
export function newJobId() {
  const d = new Date().toISOString();
  return d.slice(0, 10).replace(/-/g, "") + "-" + d.slice(11, 16).replace(":", "") + "-" + randomHex(3);
}

export const JOB_RE = /^\d{8}-\d{4}-[0-9a-f]{6}$/;
export const JOB_RETENTION_MS = 24 * 60 * 60 * 1000;

export function isJobExpired(job, now = Date.now()) {
  const created = Date.parse(job?.createdAt || "");
  return Number.isFinite(created) && now - created >= JOB_RETENTION_MS;
}

// Comparaison sans fuite de temps (secrets, clés de téléchargement).
export function same(a, b) {
  const x = new TextEncoder().encode(String(a || "")), y = new TextEncoder().encode(String(b || ""));
  if (x.length !== y.length || !x.length) return false;
  let r = 0;
  for (let i = 0; i < x.length; i++) r |= x[i] ^ y[i];
  return r === 0;
}

export async function readJob(env, job) {
  if (!JOB_RE.test(job || "")) return null;
  const o = await env.FILES.get(`jobs/${job}/job.json`);
  if (!o) return null;
  const data = await o.json();
  // Expire public download links independently of the R2 bucket lifecycle rule.
  // Physical R2 deletion is performed by a lifecycle rule (see README).
  return isJobExpired(data) ? null : data;
}

export async function writeJob(env, data) {
  data.updatedAt = new Date().toISOString();
  await env.FILES.put(`jobs/${data.job}/job.json`, JSON.stringify(data), {
    httpMetadata: { contentType: "application/json" },
  });
  return data;
}

export function gh(env, path, init = {}) {
  return fetch(api(env) + path, {
    ...init,
    headers: {
      "accept": "application/vnd.github+json",
      "authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "apk-factory",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
}

export function checkPackage(pkg, errors, label = "Nom de package") {
  if (!pkg) { errors.push(`${label} obligatoire (ex. app.modprod.atvlink.youtube).`); return; }
  const parts = pkg.split(".");
  if (parts.length < 2) errors.push(`${label} « ${pkg} » : au moins deux segments (ex. app.modprod.atvlink.youtube).`);
  for (const p of parts) {
    if (!/^[a-z][a-z0-9_]*$/.test(p)) {
      errors.push(`${label} « ${pkg} » : « ${p} » doit être en minuscules, commencer par une lettre, lettres/chiffres/_ seulement.`);
    } else if (JAVA_RESERVED.has(p)) {
      errors.push(`${label} « ${pkg} » : « ${p} » est un mot réservé Java.`);
    }
  }
}

// Taille d'une image PNG (null si ce n'est pas un PNG).
export function pngSize(buf) {
  const b = new Uint8Array(buf);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || sig.some((v, i) => b[i] !== v)) return null;
  const dv = new DataView(buf);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}
