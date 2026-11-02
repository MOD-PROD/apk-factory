# __APP_NAME__

__APP_DESC__

Appli ModProd créée à partir du modèle **modprod-app-template**.
Web : https://__APP_ID__.modprod.app/ · réglages : console https://admin.modprod.app

## Contenu

| Fichier | Rôle |
|---|---|
| `index.html` | L'appli entière (une seule page, hors ligne possible). Le contenu se construit dans `<main id="app">`. |
| `config-site.json` | Réglages publiés par la console (1 publication = 1 commit). Ne pas modifier à la main. |
| `sw.js` | Service worker : pages réseau d'abord, fichiers en cache, réponses redirigées recopiées. |
| `manifest.webmanifest` | Installation comme appli (PWA). |
| `_headers` | En-têtes Cloudflare Pages (`sw.js`, page et config en `no-cache`). |
| `icons/` | Icônes provisoires (engrenage). Remplacées depuis Logo Forge / la console. |
| `modprod-template.json` | Description du modèle, lue par l'assistant « Nouvelle appli » de la console. |

## Règles

- **La console n'est jamais bloquante** : sans `config-site.json` lisible, l'appli utilise le dernier état connu (cache), sinon `DEFAULTS`.
- L'appli **ne parle jamais** à admin.modprod.app : elle lit seulement `config-site.json` (sur son domaine) et l'annuaire public `https://modprod.app/modprod.json`.
- **Design** : uniquement des variables CSS (`--fond`, `--surface`, `--texte`, `--accent`, `--arrondi`…). La section `design` de la config peut les remplacer.
- **Fonctions par formule** : un élément avec `data-feature="nom"` suit la console (Activé · Cadenas · Masqué). En JavaScript : `MP.feature("nom")`, `MP.limit("nom")`.
- Champs nouveaux = optionnels, valeurs inconnues ignorées.
- Liens web **sans `.html`** ; garder `.html` en local et dans l'APK.
- **Toujours la dernière version des fichiers** (icônes comprises) : `_headers` ne met jamais de cache long sur la page,
  `sw.js`, `config-site.json`, le manifest ni `icons/` (seulement sur les polices, qui ne changent pas de nom) ;
  `sw.js` relit ses fichiers avec `cache: "reload"` à chaque nouvelle `VERSION`. Une nouvelle icône publiée par la
  console s'affiche donc au rechargement suivant (deux rechargements : un pour installer, un pour afficher).
- Jamais de secret ni d'adresse e-mail dans l'appli.

## Mise en ligne

Cloudflare Pages relié à ce dépôt : sans build, dossier racine `/`, branche `main`, domaine `__APP_ID__.modprod.app`.
L'assistant « Nouvelle appli » de la console le fait automatiquement.

## Repères pour le modèle lui-même

Les marqueurs `__APP_ID__`, `__APP_NAME__` et `__APP_DESC__` sont remplacés à la création de l'appli
(liste des fichiers concernés dans `modprod-template.json`).


## Menus réglables (modprod-menu.js)

`modprod-menu.js` est l'original du module des menus, copié dans chaque appli (bloc `MODPROD-MENU` avant `</head>`, ne pas modifier la copie).
Réglé dans AppMod → appli → **Menus** (`config-site.json` → `menus`) : menu du haut, barre du bas et menu latéral (☰), ensemble ou séparément ;
pour chacun : icône + texte ou icônes seules, PC et/ou téléphone, contenu (boutons de l'appli par défaut, boutons au choix et liens ajoutés),
texte, icône et couleur par bouton, taille et couleurs communes. Sans réglage (ou aucun menu visible) : le menu d'origine de l'appli reste.
Nouvelle appli : déclarer ses écrans dans `MENU_ACTIONS` (index.html), avec les mêmes identifiants que `menuActions` dans AppMod.
