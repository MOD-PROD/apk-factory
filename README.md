# APK Factory

Createur d’applications Android : APK signés (site web, HTML, lanceur AndroidTv)

Appli ModProd créée à partir du modèle **modprod-app-template**.
Web : https://apk-factory.modprod.app/ · réglages : console https://admin.modprod.app

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

Cloudflare Pages relié à ce dépôt : sans build, dossier racine `/`, branche `main`, domaine `apk-factory.modprod.app`.
L'assistant « Nouvelle appli » de la console le fait automatiquement.

## Repères pour le modèle lui-même

Les marqueurs `apk-factory`, `APK Factory` et `Createur d’applications Android : APK signés (site web, HTML, lanceur AndroidTv)` sont remplacés à la création de l'appli
(liste des fichiers concernés dans `modprod-template.json`).


## Menus réglables (modprod-menu.js)

`modprod-menu.js` est l'original du module des menus, copié dans chaque appli (bloc `MODPROD-MENU` avant `</head>`, ne pas modifier la copie).
Réglé dans AppMod → appli → **Menus** (`config-site.json` → `menus`) : menu du haut, barre du bas et menu latéral (☰), ensemble ou séparément ;
pour chacun : icône + texte ou icônes seules, PC et/ou téléphone, contenu (boutons de l'appli par défaut, boutons au choix et liens ajoutés),
texte, icône et couleur par bouton, taille et couleurs communes. Sans réglage (ou aucun menu visible) : le menu d'origine de l'appli reste.
Nouvelle appli : déclarer ses écrans dans `MENU_ACTIONS` (index.html), avec les mêmes identifiants que `menuActions` dans AppMod.


## Validation du circuit APK (novembre 2026)

L'APK Factory utilise Cloudflare Pages Functions et un bucket R2 lié sous le nom `FILES`.
Le site appelle `POST /api/build` (protégé par Cloudflare Access), qui enregistre une tâche et
déclenche `build-app.yml`. GitHub télécharge les fichiers d'entrée via
`/api/runner/file`, puis signe et vérifie l'APK. Le runner retourne le fichier à
`/api/runner/upload`; `POST /api/status` expose le résultat et une URL de
téléchargement à usage de clé via `/api/runner/dl`.

Les trois types d'APK ont fait l'objet de compilations réussies : site web,
lanceur Android TV et HTML. Pour HTML, le workflow `smoke-html.yml` exécute
également une vérification **réelle** R2 : création d'une tâche temporaire
authentifiée, envoi de l'APK signé, téléchargement du même APK, comparaison
octet par octet, puis suppression de la tâche temporaire.

- Test complet HTML → signature → R2 → téléchargement :
  https://github.com/MOD-PROD/apk-factory/actions/runs/42014457767
- Suite de régression (Node et Python) :
  https://github.com/MOD-PROD/apk-factory/actions/runs/42014704280
- Pour relancer manuellement : GitHub → Actions → « Smoke build HTML signed APK » →
  « Run workflow ». Le workflow automatique `build-app.yml` reste utilisable
  depuis le site et manuellement.

### Configuration de production

Variables et liaisons Cloudflare Pages :

- `FILES` : bucket R2 contenant les entrées, les résultats et l'état des tâches.
- `GITHUB_TOKEN` : jeton autorisé à lancer et consulter les Actions de ce dépôt.
- `CALLBACK_TOKEN` : secret partagé avec GitHub Actions pour les routes `/api/runner/*`.
- `SITE_URL` : facultatif ; défaut `https://apk-factory.modprod.app`.

Secrets GitHub Actions : `CALLBACK_TOKEN`, `ANDROID_KEYSTORE_B64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`.

`/api/build` et `/api/status` doivent rester sous Cloudflare Access.
Les routes `/api/runner/*` doivent être accessibles au runner GitHub ;
`file`, `upload` et `selftest` requièrent le secret de callback.
`dl` exige la clé aléatoire propre à chaque tâche. Ne jamais mettre les
secrets dans le dépôt, les URLs ou les journaux publics.

Le test `selftest` ne touche jamais aux tâches utilisateurs : il crée et efface
une tâche temporaire isolée. Il ne remplace pas un test interactif de
l'interface avec un compte Cloudflare Access réel.
