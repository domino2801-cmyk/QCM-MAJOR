# Question pour un Major - Édition Tactique

Application web de préparation au Brevet militaire de 4e niveau (BM4), avec des parcours de quiz pour les candidats et un espace d’administration pour la gestion des contenus.

<p align="center">
  <strong>QCM-MAJOR</strong> • PWA • Supabase • GitHub Pages • Formation militaire BM4
</p>

## Vue d’ensemble

QCM-MAJOR propose des quiz thématiques ou globaux dans une interface adaptée aux mobiles et aux ordinateurs. Les résultats et signalements sont gérés avec Supabase ; les questions sont corrigées côté serveur.

### Pourquoi ce projet ?

- une préparation au BM4 accessible depuis un navigateur mobile ou desktop ;
- un rythme de quiz immersif inspiré d’un entraînement de combat ;
- une expérience de révision avec scoring, classement et historique ;
- une gestion centralisée des questions et des signalements pour les administrateurs.

### Ce que propose l’application

- inscription et connexion candidat avec Supabase Auth ;
- campagne globale ou entraînement par thème ;
- mode “COMBAT DE HAUTE INTENSITE” avec chrono et pression temporelle ;
- synthèse finale avec réponses correctes, fausses, passées et points ;
- signalement d’erreurs sur les questions ;
- espace d’administration pour gérer les comptes, questions, résultats et signalements ;
- correction des réponses par Supabase ; la bonne option est transmise après la réponse afin d’alimenter la revue du bilan, sans être incluse dans la banque de questions initiale.

Le frontend statique est déployé sur GitHub Pages. Supabase fournit l’authentification, les données et les fonctions serveur nécessaires. Les quiz nécessitent une session en ligne ; la correction hors connexion n’est pas prise en charge.

## Fonctionnalités principales

### Espace candidat

- inscription via Supabase Auth ;
- connexion avec email/mot de passe ;
- vérification OTP à l'inscription ;
- récupération de mot de passe ;
- campagne globale de révision ;
- entraînement thématique ;
- mode "COMBAT DE HAUTE INTENSITE" avec chrono ;
- scoring côté serveur, réponses correctes/fausses/passées ;
- écran de conclusion avec synthèse pédagogique ;
- signalement de question avec commentaire optionnel.

### Espace administrateur

- gestion des comptes et profils ;
- gestion des questions (ajout, édition, suppression, dédoublonnage) ;
- consultation des signalements ;
- suivi des résultats et des listes de candidats ;
- filtrage, recherche et statistiques ;
- accès administrateur via les rôles Supabase (`app_metadata.role = admin` ou `app_metadata.bm4_admin = true`).

### Expérience mobile et PWA

- interface adaptée mobile et bureau ;
- affichage en plein écran / écran d'accueil ;
- icônes, splash screens et thème visuel militaire ;
- notifications push pour les signalements côté admin Android/Chrome ;
- cache et synchronisation différée de certaines données via le stockage du navigateur (cela ne permet pas de jouer hors connexion).

## Screenshots / captures

Captures de l’interface pour illustrer les principaux parcours :

### Authentification et Top 3 public

![Écran d’authentification et Top 3 public](./docs/screenshots/01-auth-login.png)

### Sélection de mission / préparation au combat

![Sélection des thèmes et mode d’entraînement](./docs/screenshots/02-theme-selection.png)

### Quiz en mode "COMBAT DE HAUTE INTENSITE"

![Parcours de quiz tactique](./docs/screenshots/03-quiz-combat.png)

### Bilan final candidat

![Bilan final et revue tactique](./docs/screenshots/04-result-bilan.png)

### Gestion des questions et signalements côté admin

![Administration - questions](./docs/screenshots/05-admin-questions.png)

![Administration - signalements](./docs/screenshots/06-admin-signalements.png)

## Stack technique

- Frontend : HTML5, CSS3, JavaScript Vanilla
- Authentification : Supabase Auth
- Base de données / logique applicative : Supabase
- Stockage local : navigateur (`localStorage` et `sessionStorage`)
- Hébergement : GitHub Pages
- PWA : `manifest.json`, service worker, assets graphiques

## Structure du dépôt

```text
QCM-MAJOR/
├── index.html                  # Point d'entrée de l'application
├── app.js                      # Coordination générale des modules
├── manifest.json               # Configuration PWA
├── service-worker.js           # Service worker / notifications
├── ui/
│   └── Style.css               # Styles applicatifs
├── public/
│   ├── audio/                  # Sons tactiques
│   ├── icons/                  # Icônes PWA
│   ├── images/                 # Logos et visuels
│   └── splash/                 # Splash screens mobile
├── modules/
│   ├── questions-bank/         # Banque de questions et thèmes
│   ├── quiz-engine/            # Moteur du quiz et scoring
│   ├── report-notifications/   # Gestion notifications
│   ├── startup-recovery/       # Restauration de session
│   └── ui-controller/          # Contrôle de l'interface
├── supabase/
│   ├── config.toml             # Configuration des Edge Functions
│   ├── functions/
│   └── migrations/             # Scripts SQL de base de données
├── tests/                      # Tests fonctionnels et UI
├── README.md                   # Documentation du projet
└── ...
```

## Démarrage local

Aucune étape de build n'est nécessaire pour démarrer le site.

1. Cloner le dépôt :

```bash
git clone https://github.com/domino2801-cmyk/QCM-MAJOR.git
cd QCM-MAJOR
```

2. Démarrer un petit serveur web local :

```bash
python -m http.server 8000
```

Puis ouvrir :

```text
http://localhost:8000
```

Le projet doit être servi via HTTP. L’ouverture directe de `index.html` ne permet pas de tester correctement les modules JavaScript ni l’authentification Supabase.

## Configuration Supabase

L’application lit les paramètres Supabase dans les métadonnées de `index.html` :

```html
<meta name="supabase-url" content="https://your-project.supabase.co">
<meta name="supabase-anon-key" content="your-anon-key">
<meta name="supabase-profiles-rls" content="verified">
```

### Prérequis côté Supabase

- activer le fournisseur Email pour l'inscription et la récupération de mot de passe ;
- configurer les redirect URLs d'authentification ;
- créer et sécuriser les tables `question_bank`, `profiles`, `quiz_results` et `question_reports` ;
- activer Row Level Security (RLS) et appliquer les politiques d’accès prévues par les migrations ;
- configurer les rôles administrateurs via `app_metadata.role = admin` ou `app_metadata.bm4_admin = true`.

Appliquer les migrations du dossier `supabase/migrations/` dans l’ordre chronologique. La migration `20261017192000_server_side_question_grading.sql` limite la lecture de `question_bank` aux colonnes nécessaires, réserve l’accès aux corrigés à une RPC administrateur et ajoute la correction par une RPC authentifiée. Les questions nécessitent une session Supabase active ; le quiz hors connexion n’est pas disponible. Les signalements candidat ne transmettent pas l’index de la réponse correcte.

Après application, vérifier les fonctions `get_admin_question_bank` et `grade_question_answer`, leurs droits d’exécution et les privilèges de colonnes. Ne rétablissez pas de privilège `SELECT` global sur `question_bank` pour `anon` ou `authenticated` : cela pourrait exposer `correct_answer`.

### Top 3 public

Le classement affiché avant connexion est chargé par la fonction RPC publique `get_public_global_campaign_top3()`. Elle renvoie le pseudo, la note et la date des trois meilleurs résultats globaux (`theme = 'all'`), sans accès anonyme direct à la table `quiz_results`. Appliquer la migration `20260926082000_create_public_global_campaign_top3_view.sql` pour activer ce classement.

## Notifications et déploiement

Le dépôt contient :

- les notifications de signalement côté admin ;
- le déploiement statique sur GitHub Pages ;
- l'installation en tant qu'application sur mobile ;
- une interface statique et des fonctions applicatives hébergées par Supabase.

Les notifications push de signalement sont réservées aux administrateurs et nécessitent une configuration VAPID, la fonction Edge `report-push` et les migrations associées. Voir `supabase/functions/` et `supabase/migrations/`.

## Documentation juridique et conformité

Les mentions légales et la page de confidentialité sont accessibles depuis le pied de page de l’application. Elles décrivent le fonctionnement observé dans le code : hébergement GitHub Pages, services Supabase, données de compte et d’activité, signalements, classement public, stockage navigateur et notifications push facultatives pour les administrateurs.

Les mentions identifient l’éditeur comme domino2801 et indiquent l’adresse de contact fournie. La page de confidentialité ne prétend pas qu’une purge automatique après un an existe : le code ne prévoit pas de suppression automatique de ce type pour les comptes inactifs, les résultats ou les signalements. L’éditeur doit définir et appliquer ses durées de conservation et vérifier que les bases légales correspondent à sa situation. Les durées appliquées par les prestataires à leurs sauvegardes relèvent de leurs propres règles.

Ces textes fournissent une information générale et ne remplacent pas une validation juridique adaptée à l’éditeur et à son activité.

## Qualité et tests

Les tests du dossier `tests/` couvrent notamment :

- authentification et inscription ;
- question bank et thèmes ;
- résultats, historique et classement ;
- écrans statiques et parcours de quiz ;
- notifications et modules de récupération.

Lancer les tests avec Node.js :

```bash
node --test tests/*.test.mjs
```

## À retenir

QCM-MAJOR est une application web de préparation au BM4 avec un frontend statique sur GitHub Pages et des fonctions de données et de correction côté Supabase.

---

Pour toute contribution, il est recommandé de garder la logique métier dans les modules du dossier `modules/`, les styles dans `ui/Style.css`, et d'éviter les modifications directes dans le HTML sauf si le besoin concerne la structure ou les métadonnées de configuration.
