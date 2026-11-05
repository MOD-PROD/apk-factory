// Cloudflare Access session check. Does not issue separate ModProd accounts or tokens.
// Requires ACCESS_TEAM and ACCESS_AUD configured as Cloudflare Pages environment variables.
import { json } from "../_shared.js";

const decoder = new TextDecoder();
let cached = { host: "", at: 0, keys: [] };

function decode64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid token encoding");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), x => x.charCodeAt(0));
}

function accessHost(team) {
  const value = String(team || "").trim().replace(/^https:\/\//, "").replace(/\/$/, "").toLowerCase();
  if (/^[a-z0-9-]+$/.test(value)) return value + ".cloudflareaccess.com";
  if (/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(value)) return value;
  return null;
}

async function accessKeys(host) {
  if (cached.host === host && cached.keys.length && Date.now() - cached.at < 60 * 60 * 1000) return cached.keys;
  const response = await fetch("https://" + host + "/cdn-cgi/access/certs");
  if (!response.ok) throw new Error("Access certificates unavailable");
  const body = await response.json();
  if (!Array.isArray(body.keys) || !body.keys.length) throw new Error("Access certificates missing");
  cached = { host, at: Date.now(), keys: body.keys };
  return cached.keys;
}

export async function verifyAccess(request, env) {
  const host = accessHost(env.ACCESS_TEAM);
  const audience = String(env.ACCESS_AUD || "").trim();
  if (!host || !audience) return { configured: false, authenticated: false };
  const token = request.headers.get("Cf-Access-Jwt-Assertion") || "";
  if (!token) return { configured: true, authenticated: false };
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { configured: true, authenticated: false };
    const header = JSON.parse(decoder.decode(decode64Url(parts[0])));
    const claims = JSON.parse(decoder.decode(decode64Url(parts[1])));
    if (header.alg !== "RS256" || typeof header.kid !== "string") return { configured: true, authenticated: false };
    const now = Date.now() / 1000;
    if (!Number.isFinite(claims.exp) || claims.exp <= now ||
        (claims.nbf != null && claims.nbf > now + 60) ||
        claims.iss !== "https://" + host ||
        !(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(audience)) {
      return { configured: true, authenticated: false };
    }
    const keys = await accessKeys(host);
    const jwk = keys.find(k => k.kid === header.kid);
    if (!jwk) return { configured: true, authenticated: false };
    const key = await crypto.subtle.importKey("jwk", jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key,
      decode64Url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
    return { configured: true, authenticated: valid };
  } catch {
    return { configured: true, authenticated: false };
  }
}

export async function onRequestGet({ request, env }) {
  const result = await verifyAccess(request, env);
  if (!result.configured) {
    return json({ authenticated: false, access: "not_configured", message: "ACCESS_TEAM et ACCESS_AUD requis." }, 503);
  }
  return json({ authenticated: result.authenticated, access: "cloudflare_access" },
    result.authenticated ? 200 : 401);
}
