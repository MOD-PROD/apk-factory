// Service worker des applis ModProd (modèle modprod-app-template).
// VERSION est changée par la console quand elle publie de nouvelles icônes : ne pas renommer cette ligne.
const VERSION = "2026-11-02.1";
const CACHE = "apk-factory-" + VERSION;

// Fichiers gardés pour le hors ligne. Sur Cloudflare Pages, la page se sert en "./" (pas de .html).
const CORE = ["./", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-180.png"];

self.addEventListener("install", e => {
  // cache: "reload" : on va chercher la vraie dernière version (pas la copie du navigateur), ex. une nouvelle icône
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u =>
    fetch(new Request(u, {cache: "reload"})).then(async r => { if(r.ok) await c.put(u, await clean(r)); }).catch(() => {})
  ))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("apk-factory-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cloudflare Pages redirige page.html → /page (308). Une réponse « redirigée » mise en cache
// casse la navigation (ERR_FAILED) : on en fait une copie propre avant de la ranger.
async function clean(res){
  if(!res || !res.redirected) return res;
  const body = await res.blob();
  return new Response(body, {status: res.status, statusText: res.statusText, headers: res.headers});
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);
  if(url.origin !== location.origin) return;                   // polices Google, annuaire… : le navigateur gère
  if(url.pathname.endsWith("/config-site.json")) return;       // toujours en direct (cache géré par l'appli)

  // Pages : réseau d'abord, cache en secours (hors ligne)
  if(req.mode === "navigate"){
    e.respondWith((async () => {
      try{
        const res = await clean(await fetch(req));
        if(res.ok){ const c = await caches.open(CACHE); c.put("./", res.clone()); }
        return res;
      }catch(err){
        return (await caches.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Autres fichiers : cache d'abord, puis réseau (et mise en cache)
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if(hit) return hit;
    try{
      const res = await clean(await fetch(req));
      if(res.ok){ const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    }catch(err){
      return Response.error();
    }
  })());
});
