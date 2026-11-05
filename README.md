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

APK Factory ne présente pas de boutons Dashboard ou AppMod dans son en-tête.\nCes outils administrent l'application depuis ModProd, sans ajouter de navigation intrusive.


## Confidentialité des fabrications

Chaque **nouvelle** fabrication reçoit une clé de suivi privée de 192 bits
(`statusKey`), différente de la clé permettant de télécharger l'APK.
Le client conserve cette clé uniquement dans son historique local et l'envoie
dans le corps de `POST /api/status` (jamais dans une URL). L'API refuse
de divulguer le statut, les métadonnées ou le lien de téléchargement d'une
fabrication récente sans la bonne clé. Cette protection limite la découverte
accidentelle des fabrications par d'autres utilisateurs autorisés.

Les anciennes tâches créées sans `statusKey` restent compatibles jusqu'à
leur expiration de 24 heures. Il ne s'agit pas encore d'un véritable historique
multiappareil associé au compte ModProd : cette évolution nécessite de valider
l'identité ModProd côté serveur et une synchronisation autorisée. Les clés de
suivi ne doivent pas être copiées dans les journaux publics.

## Sauvegarde facultative Google Drive et rétention R2

Objectif : APK Factory ne conserve pas durablement les APK sur Cloudflare.
Après fabrication, l'utilisateur a le choix entre le téléchargement direct et
**« Sauvegarder sur mon Google Drive »**. L'APK est téléchargé **une seule fois**
par son navigateur depuis R2, puis envoyé **directement du navigateur à Google
Drive**, sans passage supplémentaire par les Workers de ModProd. Un jeton
OAuth temporaire est demandé à Google lors d'un clic utilisateur ; il n'est
jamais inscrit dans R2, dans un cookie ModProd ou dans une URL.

Le dossier de destination est `Mon Drive / ModProd / APK Factory`. La copie
est considérée réussie uniquement après relecture auprès de Google Drive
des métadonnées `id`, `name`, `size` et `parents`.

### Configuration Google nécessaire

1. Dans Google Cloud, activer **Google Drive API**, configurer l'écran de
   consentement OAuth et créer un **OAuth Client ID de type application Web**.
2. Ajouter `https://apk-factory.modprod.app` aux origines JavaScript
   autorisées du client OAuth. Configurer les utilisateurs de test si Google
   impose un mode de test ; la publication/vérification OAuth dépend de
   la configuration Google Cloud du projet.
3. Cloudflare Pages, projet APK Factory → Variables : renseigner
   `GOOGLE_DRIVE_CLIENT_ID` avec cet ID **public** (forme
   `123456-xxxxx.apps.googleusercontent.com`). Redéployer Pages.
   **Ne pas** créer ni exposer un secret client pour l'application navigateur.
4. Tester manuellement la génération d'un APK, cliquer « Sauvegarder sur mon
   Google Drive », consentir à `drive.file` et vérifier le fichier sur Drive.

En absence d'ID OAuth, le bouton explique que Drive n'est pas encore
configuré. Le téléchargement direct reste disponible. Le scope `drive.file`
limite l'application aux fichiers qu'elle crée ou que l'utilisateur choisit
explicitement ; aucun accès général à tout le Drive n'est demandé.

### Rétention de 24 heures : deux couches

- **Code APK Factory** : les tâches créées depuis au moins 24 heures ne
  permettent plus la consultation des métadonnées ni le téléchargement via
  `/api/runner/dl`. Le code **ne supprime pas à lui seul** les octets R2.
- **Cloudflare R2** : ajouter **une règle de cycle de vie** sur le bucket lié
  `FILES`, uniquement sur le préfixe `jobs/`, expiration après **1 jour**.
  Exemple de configuration par Wrangler avec accès autorisé au compte :

  ```bash
  npx wrangler r2 bucket lifecycle add apk-factory apk-factory-jobs jobs/ --expire-days 1
  npx wrangler r2 bucket lifecycle list apk-factory
  ```

  Vérifier le nom réel du bucket dans Cloudflare avant d'exécuter la commande.
  Si le bucket stocke d'autres fichiers, **ne pas** utiliser une règle globale
  sans filtre. Les effacements R2 ne sont pas instantanés : ils peuvent avoir
  lieu après l'expiration prévue.

Une seconde protection est prévue dans le dépôt : la route
`POST /api/runner/cleanup`, authentifiée par le secret `CALLBACK_TOKEN`,
supprime les objets des tâches expirées sous `jobs/` seulement. Le workflow
`.github/workflows/cleanup-r2.yml` l'appelle automatiquement toutes les
6 heures (UTC), en lots limités pour éviter des opérations R2 excessives.
En cas de réponse 405, vérifier que la route Pages Function est réellement
déployée. Ce nettoyage nécessite le workflow GitHub actif, le secret
`CALLBACK_TOKEN` et l'accès HTTP à `apk-factory.modprod.app`.

Conserver aussi une règle de cycle de vie **dans Cloudflare R2**, indépendante
des workflows GitHub, reste recommandé : elle est la protection ultime si
GitHub Actions ne s'exécute pas. Un commit GitHub ne configure pas
automatiquement cette règle. Vérifier son activation dans Cloudflare.
La copie temporaire n'est **jamais effacée prématurément** si la sauvegarde
Google Drive échoue : l'utilisateur conserve son délai normal de téléchargement.
Après 24 h, elle expire selon la politique de rétention, même si l'utilisateur
n'a pas choisi de sauvegarder. L'interface doit présenter clairement ce délai.

### Limitation de charge Cloudflare et GitHub

Pour éviter des lectures et écritures inutiles sur R2 pendant les builds :

- Le navigateur consulte `/api/status` toutes les **8 secondes**, au lieu
  de 4 secondes, et suspend ses requêtes lorsque l'onglet est masqué
  (reprise à la prochaine échéance).
- Les consultations GitHub et les écritures d'état dans R2 sont limitées
  à **une fois toutes les 15 secondes par tâche**, tant qu'aucun callback
  n'a annoncé le résultat final. La notification finale du runner GitHub
  continue de mettre à jour R2 immédiatement.
- Le navigateur arrête sa boucle de suivi après 30 minutes. La tâche
  continue sur GitHub et reste accessible via son historique local tant
  que la période de 24 heures n'est pas écoulée.

La limitation réduit la consommation lorsque beaucoup de personnes
fabriquent un APK simultanément, sans nouveau service ni base.
Le test `tests/status-rate-limit.test.mjs` vérifie que plusieurs
consultations rapprochées ne déclenchent qu'une seule requête GitHub
et une seule écriture R2, tout en détectant un APK déjà finalisé.

### Historique multiappareil facultatif

L'écran d'accueil propose **« Synchroniser l'historique avec Google Drive »**
lorsque le client OAuth Google est configuré et la bibliothèque GIS disponible.
Le bouton demande une autorisation explicite puis fusionne les fabrications
locales avec un petit fichier `ModProd / APK Factory / historique.json` dans
le Drive personnel. Le second appareil peut importer les fabrications avec
le même bouton et le même compte Google.

Le manifeste `modprod-apk-history-v1` ne contient que les informations
nécessaires : identifiant de tâche, date, nom, package, type, état et clé
privée de suivi (`statusKey`). **Aucun APK, URL de téléchargement ou jeton
OAuth n'est synchronisé.** Les clés de suivi étant privées, ce fichier Drive
doit rester dans le compte Google choisi par l'utilisateur. Les anciennes
tâches créées sans clé gardent leur fonctionnement antérieur jusqu'à expiration.

La synchronisation est **manuelle** pour ne pas solliciter Drive ni mélanger
implicitement plusieurs comptes Google sur un ordinateur partagé. Elle ne
prolonge pas la durée de vie des liens R2 : après 24 heures, les métadonnées
de l'historique subsistent mais les APK temporaires ne sont plus récupérables.
La restauration de l'historique ne dépend d'aucune nouvelle base Cloudflare.

Cette intégration Google Drive n'est pas encore une authentification ModProd
de bout en bout : l'association d'une fabrication à l'identité ModProd côté
serveur et la politique des droits restent un chantier distinct.

### Contrôles réalisés

- Exécution **réelle** du nettoyage programmé le 5 novembre 2026 :
  [GitHub Actions #42034429753](https://github.com/MOD-PROD/apk-factory/actions/runs/42034429753).
  Résultat du runner : `jobsScanned: 6`, `objectsDeleted: 15`.
- Vérifications automatisées du transfert Google Drive par morceaux de
  **8 Mio**, de la vérification des fichiers, des erreurs d'upload et de la
  protection des tâches R2 récentes :
  [GitHub Actions #42034734194](https://github.com/MOD-PROD/apk-factory/actions/runs/42034734194).
- L'autorisation Google est préchargée **sans afficher le consentement**.
  La demande de consentement est ouverte seulement lors du clic de
  l'utilisateur, afin de ne pas perdre l'activation utilisateur du navigateur.

**Activation Google Drive non encore confirmée en production** : le client
OAuth `GOOGLE_DRIVE_CLIENT_ID` doit être défini et le consentement Google
testé avec un véritable utilisateur. L'exécution réussie du nettoyage
R2 n'implique pas qu'une règle native de cycle de vie du bucket ait été
configurée ; celle-ci reste recommandée comme filet de sécurité.
