// Public OAuth client identifier only. Never send Google secrets or bearer tokens to R2.
import { json } from "../../_shared.js";

export async function onRequestGet({ env }) {
  const id = String(env.GOOGLE_DRIVE_CLIENT_ID || "").trim();
  if (!/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(id)) {
    return json({ enabled: false, message: "Google Drive non configuré : GOOGLE_DRIVE_CLIENT_ID manquant." });
  }
  return json({ enabled: true, clientId: id, scope: "https://www.googleapis.com/auth/drive.file" });
}
