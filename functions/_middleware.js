// Toute visite sur l'adresse d'origine Cloudflare (*.pages.dev) est renvoyée vers le vrai domaine,
// qui est protégé par Cloudflare Access. Sinon apk-factory.pages.dev contournerait la protection.

import { site } from "./_shared.js";

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (url.hostname === "pages.dev" || url.hostname.endsWith(".pages.dev")) {
    return Response.redirect(site(env) + url.pathname + url.search, 308);
  }
  return next();
}
