// Optional user-initiated Google Drive backup. Google credentials never pass through ModProd.
// The APK is fetched once from the temporary R2 download URL, then sent directly to Drive.
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const APK_MIME = "application/vnd.android.package-archive";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

let gisLoading = null;
let driveSettings = null;

function googleIdentityScript() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => globalThis.google?.accounts?.oauth2
      ? resolve() : reject(new Error("Connexion Google indisponible."));
    script.onerror = () => reject(new Error("Impossible de charger la connexion Google."));
    document.head.append(script);
  }).catch(error => { gisLoading = null; throw error; });
  return gisLoading;
}

function googleToken(clientId) {
  // Important: requestAccessToken runs synchronously in the user's click event.
  // Loading scripts or fetching config first can lose the browser user gesture.
  if (!globalThis.google?.accounts?.oauth2) throw new Error("Connexion Google non prête.");
  return new Promise((resolve, reject) => {
    let client;
    try {
      client = globalThis.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: response => {
          if (response.error || !response.access_token) reject(new Error("Autorisation Google Drive refusée."));
          else resolve(response.access_token);
        },
        error_callback: () => reject(new Error("Connexion Google annulée."))
      });
      // Explicit user interaction: Google displays its consent flow.
      client.requestAccessToken({ prompt: "consent" });
    } catch (error) { reject(error); }
  });
}

async function driveFetch(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  if (!response.ok) {
    let detail = "";
    try { detail = (await response.json()).error?.message || ""; } catch {}
    throw new Error(`Google Drive : HTTP ${response.status}${detail ? " — " + detail.slice(0, 150) : ""}`);
  }
  return response;
}

async function findOrCreateFolder(name, parent, token) {
  const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = [
    `name = '${escaped}'`,
    `mimeType = '${FOLDER_MIME}'`,
    `'${parent}' in parents`,
    "trashed = false"
  ].join(" and ");
  const params = new URLSearchParams({ q, fields: "nextPageToken,files(id,name)", pageSize: "25" });
  const listed = await driveFetch(DRIVE_API + "?" + params, token);
  const found = (await listed.json()).files?.find(item => item.name === name);
  if (found?.id) return found.id;
  const created = await driveFetch(DRIVE_API + "?fields=id,name", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] })
  });
  const folder = await created.json();
  if (!folder.id) throw new Error("Dossier Google Drive non créé.");
  return folder.id;
}

async function uploadResumable(blob, name, folderId, token) {
  const opened = await driveFetch(DRIVE_UPLOAD + "&fields=id,name,size,webViewLink", token, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": APK_MIME,
      "X-Upload-Content-Length": String(blob.size)
    },
    body: JSON.stringify({ name, mimeType: APK_MIME, parents: [folderId] })
  });
  const session = opened.headers.get("Location");
  if (!session || !/^https:\/\/[a-z0-9.-]*googleapis\.com\//i.test(session)) {
    throw new Error("Session de transfert Google Drive non disponible.");
  }
  // Direct browser-to-Drive transfer using 8 MiB chunks (multiple of 256 KiB).
  let result = null;
  for (let start = 0; start < blob.size;) {
    const end = Math.min(blob.size, start + UPLOAD_CHUNK_BYTES);
    const response = await fetch(session, {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": APK_MIME,
        "Content-Range": "bytes " + start + "-" + (end - 1) + "/" + blob.size
      },
      body: blob.slice(start, end)
    });
    if (response.status === 308) {
      if (end === blob.size) throw new Error("Google Drive n'a pas finalisé le transfert.");
      const range = response.headers.get("Range");
      const confirmed = /^bytes=0-(\d+)$/.exec(range || "");
      if (!confirmed || Number(confirmed[1]) + 1 !== end) {
        throw new Error("Impossible de confirmer la progression du transfert Google Drive.");
      }
      start = end;
      continue;
    }
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json()).error?.message || ""; } catch {}
      throw new Error("Google Drive : HTTP " + response.status
        + (detail ? " — " + detail.slice(0, 150) : ""));
    }
    if (end !== blob.size) throw new Error("Google Drive a terminé le transfert trop tôt.");
    result = await response.json();
    start = end;
  }
  if (!result?.id) throw new Error("Google Drive n'a pas confirmé le fichier.");
  // Check the actual Drive metadata, not only the HTTP status of the upload.
  const inspected = await driveFetch(DRIVE_API + "/" + encodeURIComponent(result.id)
    + "?fields=id,name,size,parents,webViewLink", token);
  const saved = await inspected.json();
  if (saved.name !== name || Number(saved.size) !== blob.size
      || !Array.isArray(saved.parents) || !saved.parents.includes(folderId)) {
    throw new Error("La copie sur Google Drive n'a pas pu être vérifiée.");
  }
  return { id: saved.id, name: saved.name, link: saved.webViewLink || "https://drive.google.com/drive/u/0/my-drive" };
}

export async function prepareGoogleDrive() {
  const configuration = await fetch("api/drive/config", { cache: "no-store", credentials: "same-origin" });
  if (!configuration.ok) throw new Error("Paramètres Google Drive indisponibles.");
  const settings = await configuration.json();
  if (!settings.enabled || !settings.clientId) {
    throw new Error(settings.message || "Google Drive n'est pas encore configuré par ModProd.");
  }
  await googleIdentityScript();
  driveSettings = settings;
  return { enabled: true };
}

export async function saveApkToGoogleDrive(apk) {
  if (!apk || !/^https:\/\//.test(apk.url) || !/^[A-Za-z0-9._-]{1,150}\.apk$/.test(apk.name)) {
    throw new Error("APK indisponible pour la sauvegarde.");
  }
  if (!driveSettings?.clientId) throw new Error("Google Drive n'est pas encore prêt.");
  // There is no await before Google opens its consent UI.
  const token = await googleToken(driveSettings.clientId);
  const result = await fetch(apk.url, { cache: "no-store" });
  if (!result.ok) throw new Error("APK temporaire expiré : retélécharge-le depuis GitHub si disponible.");
  const blob = await result.blob();
  if (!blob.size || (apk.size && blob.size !== apk.size)
      || blob.type !== APK_MIME && blob.type !== "application/octet-stream") {
    throw new Error("Le fichier téléchargé n'a pas la taille ou le format attendu.");
  }
  const modprod = await findOrCreateFolder("ModProd", "root", token);
  const folder = await findOrCreateFolder("APK Factory", modprod, token);
  return uploadResumable(blob, apk.name, folder, token);
}
