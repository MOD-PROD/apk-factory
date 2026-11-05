// The pages.dev origin redirects to the protected custom domain.
// When Access verification is configured, protected API operations also
// validate the signed Cloudflare Access assertion at the origin.
import { site, json } from "./_shared.js";
import { verifyAccess } from "./api/session.js";

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (url.hostname === "pages.dev" || url.hostname.endsWith(".pages.dev")) {
    return Response.redirect(site(env) + url.pathname + url.search, 308);
  }

  if ((url.pathname === "/api/build" || url.pathname === "/api/status") &&
      (env.ACCESS_TEAM || env.ACCESS_AUD)) {
    const session = await verifyAccess(request, env);
    if (!session.configured) {
      return json({ error: "Configuration Cloudflare Access incomplète." }, 503);
    }
    if (!session.authenticated) {
      return json({ error: "Session Cloudflare Access requise." }, 401);
    }
  }
  return next();
}
