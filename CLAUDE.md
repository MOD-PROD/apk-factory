# APK Factory — notes pour Claude

Créateur d'applications Android (APK signés : site web, HTML, lanceur Android TV). Créée depuis le modèle d'appli le 02/11/2026.
Fait partie de la suite **ModProd** et est **réglée par la console AppMod** (https://admin.modprod.app). Site : https://apk-factory.modprod.app/
Si le skill **modprod-appmod** est disponible, charge-le avant de travailler.

## Propre à ce dépôt

- Le contenu se construit dans `<main id="app">` de `index.html` ; garder le reste du modèle.
- Boutons proposés dans les menus : `MENU_ACTIONS` dans `index.html` = `menuActions` d'APK Factory dans `appmod/data/apps.json`.

## Règles de la suite

- `config-site.json` est publié par AppMod (1 publication = 1 commit) : ne pas le modifier à la main. La page le lit sur son propre site et tourne avec son cache ou ses valeurs par défaut sans réseau (rien n'est jamais bloquant).
- Modules communs copiés à l'identique entre repères : `<!-- MODPROD-MENU : début/fin -->` (menus, en-tête, assets) et `<!-- MODPROD-TRAVAUX : début/fin -->` (page construction / maintenance). Ne jamais les modifier ici : l'original est dans `MOD-PROD/modprod-app-template`, puis on recopie partout.
- Collection d'assets dans `assets/` (`assets/assets.json`, format modprod-assets v1), gérée depuis AppMod / Asset Library.
- La page ne parle jamais à admin.modprod.app ; compte, formule, paiement et synchro passent par https://api.modprod.app.
- Liens web sans `.html` ; pas de cache long sur la page, `sw.js`, la config, le manifest ni `icons/`. Jamais de secret ni d'adresse e-mail dans les fichiers.
- Version automatique par `.github/workflows/version.yml` : ne pas modifier `version.json` à la main.
- Tester dans un navigateur headless à 375 px et sur PC, sans erreur JavaScript, avant de pousser. Messages de commit en français.
