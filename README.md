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


### Contrôle de session Cloudflare Access (ModProd)

La route `GET /api/session` vérifie cryptographiquement un JWT Cloudflare Access
(recherche de la clé publique dans le JWKS du domaine d'équipe, signature RS256,
issuer, audience et expiration). Aucun nouveau mot de passe, utilisateur ou jeton
ModProd n'est émis, et aucune adresse e-mail n'est exposée par cette route.

Pour activer ce contrôle de session dans les variables **Cloudflare Pages** d'APK Factory :

- `ACCESS_TEAM` : nom d'équipe Zero Trust (ou domaine `<équipe>.cloudflareaccess.com`).
- `ACCESS_AUD` : *Application Audience (AUD) Tag* de l'application Access
  protégeant `apk-factory.modprod.app` (ce n'est pas nécessairement le même
  AUD que celui du Dashboard ou d'AppMod).

Réponses : `200` si le jeton est valide, `401` si absent/invalide et `503`
si les paramètres ne sont pas définis. Cette route est **diagnostique**.

Lorsque `ACCESS_TEAM` et `ACCESS_AUD` sont renseignés, les routes
`/api/build` et `/api/status` imposent également la vérification du JWT signé
côté Pages Function (401 si invalide). Une configuration partielle bloque ces
API (503). Sans ces variables, la protection existante par Cloudflare Access
en amont reste seule responsable du contrôle d'accès. Les routes du runner
conservent leur authentification distincte par `CALLBACK_TOKEN` et clé de
téléchargement. Cette vérification côté origine complète mais ne remplace
jamais les politiques Cloudflare Access sur les domaines.

**SSO entre Dashboard, AppMod et APK Factory** : dans Cloudflare Zero Trust,
configurer les trois applications avec le même compte d'équipe / fournisseur
d'identité et des politiques d'accès cohérentes. Chaque application possède
son propre AUD ; la réutilisation de la session de l'identité dépend des règles
Zero Trust et ne se déduit pas du catalogue ModProd. Tester la navigation
Dashboard → APK Factory avec un compte autorisé avant de déclarer le SSO validé.


## Intégrations dans la suite ModProd

APK Factory conserve son moteur GitHub Actions + Morphe + Cloudflare R2 :
les intégrations n'introduisent ni comptes supplémentaires ni base de données.

- **Dashboard** : fiche officielle sur
  `https://dashboard.modprod.app/applications/apk-factory` ;
  raccourcis vers « Créer un APK », AppMod et les builds GitHub Actions.
- **AppMod** : l'application est décrite dans
  `MOD-PROD/appmod/data/apps.json` avec les quatre actions de menu
  `accueil`, `atv`, `web` et `applis`, alignées sur `MENU_ACTIONS`.
  Les fonctions visuelles `atv`, `siteWeb` et `html` sont exposées
  dans la matrice des réglages ; l'interface respecte leurs états.
  Ces réglages d'interface **ne constituent pas** une autorisation serveur.
- **Cloudflare Access** : la connexion relève de la même équipe et
  du fournisseur d'identité configurés dans Zero Trust. La route
  `/api/session` peut vérifier le JWT du domaine APK Factory quand
  `ACCESS_TEAM` et `ACCESS_AUD` sont configurés. L'API de fabrication
  requiert alors également le JWT signé. Les politiques et les sessions
  réelles doivent être confirmées dans le tableau de bord Cloudflare.
- **Registre central** : entrée `apk-factory` dans
  `https://modprod.app/modprod.json`, utilisée par le Dashboard.

Les liens vers Dashboard et AppMod dans l'en-tête APK Factory permettent
de revenir à la suite sans modifier les droits ni partager de jetons.
