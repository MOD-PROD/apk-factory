// Proposed settings contract; not yet wired to the Android runtime.
export const MODES = Object.freeze({
  webview: Object.freeze(['standalone','fullscreen','immersive']),
  customTabs: Object.freeze(['browser']),
  twa: Object.freeze(['standalone','fullscreen'])
});
export function normalizeWebAppSettings(input = {}, type = 'site-web') {
  const engine = input.engine ?? 'webview';
  if (!Object.hasOwn(MODES,engine)) throw new Error('Moteur inconnu');
  if (type !== 'site-web' && engine !== 'webview') throw new Error('Ce moteur nécessite un site HTTPS');
  const display = input.display ?? (input.fullscreen === true ? 'fullscreen' : MODES[engine][0]);
  if (!MODES[engine].includes(display)) throw new Error('Affichage incompatible avec le moteur');
  const orientation = input.orientation ?? 'portrait';
  if (!['auto','portrait','landscape'].includes(orientation)) throw new Error('Orientation inconnue');
  if (engine !== 'webview' && orientation !== 'auto') {
    if (input.orientation !== undefined) throw new Error('Orientation contrôlée par le navigateur');
  }
  return {engine,display,orientation:engine === 'webview' ? orientation : 'auto',
    requiresDomainVerification:engine === 'twa'};
}
