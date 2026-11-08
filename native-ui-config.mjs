/* APK Factory — configuration d'interface Android avant compilation.
 * Ne modifie jamais config-site.json (réservé aux publications AppMod).
 * Ce module décrit les choix de l'utilisateur, pas les menus web d'AppMod.
 */
export const ASSET_LIBRARY = 'https://asset-library.modprod.app/';
export const DEFAULT_NATIVE_UI = Object.freeze({
  version: 1,
  theme: 'dark',
  webviewBackground: '#000000',
  header: { enabled: true, title: '', background: '#202126', buttons: [] },
  navigation: { enabled: true, position: 'bottom', background: '#202126', buttons: [
    { id: 'menu', action: 'menu' },
    { id: 'home', action: 'home' },
    { id: 'back', action: 'back' }
  ] }
});
const ACTIONS = new Set(['url-internal','url-external','back','forward','home','reload','menu']);
const COLOR = /^#[0-9a-fA-F]{6}$/;
function color(value, fallback) { return typeof value === 'string' && COLOR.test(value) ? value : fallback; }
function asset(input) {
  if (!input || typeof input !== 'object') return null;
  const mode = ['reference','copy','import'].includes(input.mode) ? input.mode : 'reference';
  // No remote arbitrary URL: only library identifiers, or build-time local paths.
  const id = typeof input.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(input.id) ? input.id : null;
  const path = typeof input.path === 'string' && /^assets\/[a-zA-Z0-9_./-]+$/.test(input.path) && !input.path.includes('..') ? input.path : null;
  if (mode === 'reference' && !id) return null;
  if (mode !== 'reference' && !path) return null;
  return { mode, ...(mode === 'reference' ? { id } : { path }) };
}
function button(b, index) {
  if (!b || typeof b !== 'object') return null;
  const action = ACTIONS.has(b.action) ? b.action : 'url-internal';
  let url;
  if (action.startsWith('url-')) {
    try { const u = new URL(b.url); if (u.protocol !== 'https:') return null; url = u.href; }
    catch { return null; }
  }
  return { id: String(b.id || 'button-'+index).slice(0,48),
    label: String(b.label || '').slice(0,60), action,
    ...(url ? { url } : {}), icon: asset(b.icon), color: color(b.color,'#FFFFFF') };
}
export function normalizeNativeUi(input = {}) {
  const h = input.header || {}, n = input.navigation || {};
  const headerButtons = Array.isArray(h.buttons) ? h.buttons.slice(0,4).map(button).filter(Boolean) : [];
  const navButtons = Array.isArray(n.buttons) ? n.buttons.slice(0,6).map(button).filter(Boolean) : [];
  return {
    version: 1, theme: input.theme === 'light' ? 'light' : 'dark',
    webviewBackground: color(input.webviewBackground,'#000000'),
    header: { enabled: h.enabled !== false, title: String(h.title || '').slice(0,80),
      background: color(h.background,'#202126'), buttons: headerButtons },
    navigation: { enabled: n.enabled !== false, position: n.position === 'top' ? 'top' : 'bottom',
      background: color(n.background,'#202126'), buttons: navButtons.length ? navButtons : DEFAULT_NATIVE_UI.navigation.buttons }
  };
}
