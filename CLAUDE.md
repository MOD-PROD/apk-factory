# APK Factory — notes pour Claude

Créateur d'applications Android (APK signés : site web, HTML, lanceur Android TV). Créée depuis le modèle d'appli le 02/11/2026.
Fait partie de la suite **ModProd** et est **réglée par la console AppMod** (https://admin.modprod.app). Site : https://apk-factory.modprod.app/
Si le skill **modprod-appmod** est disponible, charge-le avant de travailler.

## Propre à ce dépôt

- Le contenu se construit dans `<main id="app">` de `index.html` ; garder le reste du modèle.
- Boutons proposés dans les menus : `MENU_ACTIONS` dans `index.html` = `menuActions` d'APK Factory dans `appmod/data/apps.json`.

## Cloudflare Access (propre à ce dépôt)

Contrairement aux autres applis, le site est protégé par Cloudflare Access (la fabrique et son API sont réservées à l'admin).
Pour que la suite reste branchée, certains chemins sont en **Contourner / Tout le monde** dans Zero Trust → Access → Applications :

- application « robot » : `apk-factory.modprod.app/api/runner` (retour des APK par GitHub Actions) ;
- application « fichiers publics » : `config-site.json`, `version.json`, `manifest.webmanifest`, `assets`, `icons`
  (lus par AppMod, Asset Library et la carte de modprod.app ; sans elle, l'icône de l'annuaire et l'onglet Assets d'AppMod ne marchent pas).
- `*.pages.dev` est renvoyé vers le vrai domaine par `functions/_middleware.js` pour ne pas contourner Access.

Ne jamais mettre en accès libre `/`, `index.html` ni `/api/` (hors `api/runner`). Un nouveau fichier lu par les autres applis = un chemin de plus dans « fichiers publics ».

## Règles de la suite

- `config-site.json` est publié par AppMod (1 publication = 1 commit) : ne pas le modifier à la main. La page le lit sur son propre site et tourne avec son cache ou ses valeurs par défaut sans réseau (rien n'est jamais bloquant).
- Modules communs copiés à l'identique entre repères : `<!-- MODPROD-MENU : début/fin -->` (menus, en-tête, assets) et `<!-- MODPROD-TRAVAUX : début/fin -->` (page construction / maintenance). Ne jamais les modifier ici : l'original est dans `MOD-PROD/modprod-app-template`, puis on recopie partout.
- Collection d'assets dans `assets/` (`assets/assets.json`, format modprod-assets v1), gérée depuis AppMod / Asset Library.
- La page ne parle jamais à admin.modprod.app ; compte, formule, paiement et synchro passent par https://api.modprod.app.
- Liens web sans `.html` ; pas de cache long sur la page, `sw.js`, la config, le manifest ni `icons/`. Jamais de secret ni d'adresse e-mail dans les fichiers.
- Version automatique par `.github/workflows/version.yml` : ne pas modifier `version.json` à la main.
- Tester dans un navigateur headless à 375 px et sur PC, sans erreur JavaScript, avant de pousser. Messages de commit en français.
