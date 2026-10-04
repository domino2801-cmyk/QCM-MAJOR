# Question pour un Major - Édition Tactique 🎖️

Le Top 3 est visible sur la connexion candidat avant identification, au-dessus du
formulaire. Le bloc reste visible pendant le chargement, sans résultats ou en cas
d'erreur, avec un message explicite. Il utilise uniquement la RPC publique et son
cache dédié, jamais les résultats privés d'un compte précédemment connecté.
Appliquer `supabase/migrations/20260926082000_create_public_global_campaign_top3_view.sql`
puis `supabase/migrations/20261003000000_public_top3_display_names.sql` avant
publication. Seuls le pseudo, la note et la date sont renvoyés ; les pseudos
contenant une adresse email sont masqués. Les politiques RLS de `quiz_results`
restent inchangées. Le classement conserve les trois meilleurs résultats, même
si un candidat apparaît plusieurs fois, et privilégie l'ancienneté à note égale.
Sur la connexion et l'historique, le premier résultat est mis en avant dans une
carte au même dégradé doré et aux mêmes animations lumineuses que le bouton
« Entrer dans le combat BM4 », sans devenir un bouton. Le trophée, le pseudo et
la note sont agrandis, avec une présentation adaptée aux écrans mobiles.
Le deuxième résultat est encadré en argent avec un halo pulsant et un reflet
lumineux argentés sur ces deux écrans.
Le troisième résultat reprend cet encadrement et ces effets lumineux en bronze.
Sur l'accueil et l'historique, des icônes SVG remplacent les emojis : coupe avec
étoile, médaille argent numérotée 2 et médaille bronze numérotée 3. Ces décorations
suivent l'ordre des trois résultats affichés, y compris en cas de notes égales.
Le Top 3 reste accessible dans l'historique candidat, mais n'est pas affiché sur
l'écran de choix de campagne.

L'historique personnel est actualisé depuis Supabase à chaque connexion candidat,
ainsi qu'à la restauration d'une session. Les graphiques, dont celui de Campagne
Globale, sont recalculés pour le candidat connecté et la période sélectionnée.
Un message indique le chargement, la réussite ou l'échec de cette actualisation ;
un échec ne bloque pas l'accès aux campagnes et ne présente pas le cache comme
un historique à jour.

Dans « Gestion des résultats », l'administrateur peut sélectionner un candidat
pour retrouver le même histogramme de Campagne Globale, la moyenne de Campagne
Globale (sans les notes des autres thèmes) et le thème
à travailler que dans l'historique personnel. Le filtre de période s'applique à
ces indicateurs ; le tableau conserve son filtre candidat et sa recherche.
Sans candidat sélectionné, une invitation remplace les indicateurs individuels.
Le podium administrateur reprend les icônes et effets or, argent et bronze.
Le podium reste compact sur ces trois écrans : icônes, textes du premier résultat
et espacements réduits, tout en conservant les effets lumineux et les couleurs.
Le titre est rapproché du premier résultat ; un statut de classement vide
n'occupe pas d'espace, tandis que les messages de chargement et d'erreur restent visibles.
La présentation du podium réduit sa hauteur d'environ moitié, à largeur conservée :
sur mobile, icône sur deux lignes, pseudo et note sur la première, date sur la
seconde ; sur ordinateur, toutes les informations tiennent sur une ligne.
L'interface administrateur ne permet plus de supprimer une note ni d'effacer
l'ensemble des résultats. La consultation, la recherche et les filtres restent
disponibles ; les politiques Supabase ne sont pas modifiées par ce changement.
Les historiques candidat et administrateur affichent la moyenne des seules
Campagnes Globales de la période, ou leur absence explicite. Les listes de période
et le filtre candidat des résultats utilisent un fond blanc et un texte noir,
y compris dans leurs options déroulantes.


**Question pour un Major - Édition Tactique** est une application web de quiz (QCM) interactive conçue pour accompagner les militaires dans leur préparation au **Brevet Militaire de 4e niveau (BM4)**. 

Le site permet aux candidats de tester leurs connaissances à travers différentes thématiques clés de la culture militaire et offre aux administrateurs une interface dédiée pour gérer le contenu pédagogique.

Le thème 6, « Implantation des unités », regroupe les questions d'implantation,
de garnison et de stationnement auparavant présentes dans les autres thèmes.
Le reclassement de la banque locale s'applique aussi aux anciennes copies locales
et au chargement Supabase, sans changer les réponses ou les identifiants. Les
questions sur l'organigramme, les missions et l'histoire du Musée de l'armée
restent dans leurs thèmes d'origine. Appliquer la migration
`supabase/migrations/20261003173000_move_unit_location_questions.sql` avec la
publication du thème 6 : elle change uniquement `question_bank.theme_id`, sans
modifier les résultats historiques. L'identifiant de banque du thème 6 est `5`,
alors que ses résultats utilisent `6`. Ses questions participent toujours à la
Campagne Globale et ses notes alimentent le thème à travailler.

### Concordance des questions et des six thèmes

Le classement suit le sujet principal de chaque question :

1. **Organisation et Commandement** : organigrammes, ressources humaines,
   formation, statut, commandement, éthique et doctrine, y compris la RNS.
2. **Matériels, Armements et Technologies** : caractéristiques, emploi technique,
   équipements, systèmes numériques et rations.
3. **Lois de Programmation Militaire** : LPM, budgets, coûts et cibles
   programmées d'effectifs ou d'équipements.
4. **Opérations Extérieures** : opérations nommées, missions extérieures ou
   intérieures, engagements et exercices.
5. **Histoire & Traditions** : créations et événements historiques, emblèmes,
   devises, saints patrons, mascottes et commémorations.
6. **Implantation des unités** : lieux d'implantation, garnisons, stationnements
   et quartiers généraux. Une mention géographique accessoire ne suffit pas :
   l'attribution d'un drapeau au CFIM de Caylus reste en Histoire & Traditions,
   et le nom complet du CENTAC relève de l'Organisation.

Les affectations auditées dans `modules/questions-bank/theme-assignments.js`
s'appliquent à la banque intégrée, aux anciennes copies locales, au chargement
Supabase et à l'enregistrement administrateur. Les intitulés génériques
« Désignez l'intrus » et « Quel est l'intrus » sont distingués par leurs réponses.
Les autres nouvelles questions conservent le thème choisi par l'administrateur,
sauf les implantations reconnues par le classement existant.

La migration `supabase/migrations/20261003190000_reconcile_question_themes.sql`
reclasse 752 questions de l'inventaire audité de 1 293 entrées. Elle est
transactionnelle et réexécutable ; elle refuse les intitulés ou affectations
modifiés depuis l'audit, plutôt que d'écraser une modification concurrente.
Elle ne change que `question_bank.theme_id` : questions, réponses, identifiants,
activation et résultats historiques sont conservés. L'entrée de démonstration
« Your question » (id 1) est signalée comme contenu à corriger séparément ;
elle n'est ni supprimée ni réécrite par ce reclassement.

---

## 🚀 Fonctionnalités

### 👨‍🎓 Espace Candidat
* **Inscription et Connexion :** Authentification Supabase avec vérification OTP email à l’inscription.
* **Mot de passe oublié :** Envoi d’un lien de récupération puis définition d’un nouveau mot de passe au retour dans l’application.
* **Campagnes de Révision :** Lancement d'une "Campagne Globale" ou entraînement par thématique ciblée.
* **Système de Notation :** Évaluation dynamique avec un score final sur **20 points**.
* **Bilan Pédagogique :** Résumé détaillé en fin de partie (réponses correctes, fausses, sautées) et rappel des questions à revoir.
* **Signalement d’erreur :** Envoi à l’administrateur d’une question suspecte, de sa bonne réponse enregistrée et d’un commentaire facultatif.

### ⚙️ Interface Administrateur
Une zone d'administration sécurisée est intégrée pour centraliser la gestion de l'application :
* **Gestion des comptes :** Visualisation et suivi des candidats inscrits.
* **Gestion des questions :** Ajout, modification, suppression et dédoublonnage automatique des QCM.
* **Signalements :** Consultation des questions signalées et de l’adresse e-mail du candidat, marquage comme traité et suppression par un administrateur.
* **Gestion des résultats :** Suivi des notes, des réponses fournies et des dates de passage des candidats, avec option de réinitialisation.
* **Accès admin sécurisé :** Connexion avec un compte Supabase autorisé via `app_metadata.role = admin` ou `app_metadata.bm4_admin = true`.

---

## 📚 Thématiques de Révision (BM4)

Les questions sont structurées autour de **5 piliers majeurs** du programme :
1. 📋 **Organisation et Commandement**
2. 🔬 **Matériels, Armements et Technologies**
3. 📜 **Lois de Programmation Militaire (LPM)**
4. 🌍 **Opérations Extérieures (OPEX)**
5. 🏛️ **Histoire & Traditions**

---

## 📂 Structure du Projet

L'arborescence du projet est organisée de manière modulaire pour séparer les responsabilités (Styles, Logique métier, Données) :

```text
QCM-MAJOR/
│
├── index.html                 # Interface principale (3 écrans)
├── app.js                     # Point d’entrée, coordination des modules
│
├── ui/
│   └── Style.css              # Style militaire (HUD, couleurs, animations)
│
├── public/
│   ├── images/                # Logos, décor, icônes
│   ├── splash/
│   │   ├── ios/               # Splash screens iPhone et iPad
│   │   └── android/           # Splash screens Android téléphone et tablette
│   └── audio/                 # Sonar, sons tactiques
│
├── modules/
│   │
│   ├── questions-bank/        # Banque de questions (découpée par thèmes)
│   │   ├── index.js           # Fusion des thèmes + accès global
│   │   ├── theme-1.js
│   │   ├── theme-2.js
│   │   ├── theme-3.js
│   │   ├── theme-4.js
│   │   └── theme-5.js
│   │
│   ├── quiz-engine/           # Moteur tactique
│   │   ├── index.js           # API du moteur
│   │   ├── engine.js          # Logique pure (chargement, mélange)
│   │   └── scoring.js         # Barème militaire (+4 / -1 / 0)
│   │
│   ├── startup-recovery/      # Fallback explicite en cas de démarrage dégradé
│   │   └── index.js
│   │
│   └── ui-controller/         # Gestion de l’interface
│       └── index.js           # Changement d’écran, marquage visuel

```

### Splash screens mobile

Les images de démarrage sont rangées dans `public/splash/ios/` et `public/splash/android/`.
Les splash screens iOS sont déclarés dans `index.html` avec leurs dimensions et ratios d'écran.
Pour Android, le navigateur/PWA utilise les icônes du `manifest.json` et sa couleur de fond ; les images Android sont conservées dans le dépôt pour une future intégration native (Capacitor ou équivalent), sans être utilisées par une balise iOS.

## 🛠️ Technologies Utilisées

* **Frontend :** HTML5, CSS3, JavaScript (Vanilla ES6)
* **Authentification :** Supabase Auth (email/password, OTP signup, recovery)
* **Persistance principale :** Supabase (profils, questions, résultats)
* **Repli local :** `localStorage` (copie de secours côté navigateur)
* **Hébergement :** GitHub Pages

---

## 💻 Installation et Utilisation Locale

Pour exécuter ce projet sur votre machine locale, aucune installation complexe n'est requise :

1. **Cloner le dépôt :**
   ```bash
   git clone https://github.com
   ```

2. **Accéder au dossier :**
   ```bash
   cd QCM-MAJOR
   ```

3. **Lancer l'application :**
   Ouvrez simplement le fichier `index.html` dans le navigateur de votre choix.

---

## 🔐 Configuration Supabase requise

Avant utilisation de l’authentification, renseignez les balises meta de `index.html` à la racine du projet :

```html
<meta name="supabase-url" content="https://your-project.supabase.co">
<meta name="supabase-anon-key" content="your-anon-key">
<meta name="supabase-profiles-rls" content="verified">
```

Prérequis côté Supabase :

* Activer le fournisseur **Email** pour l’OTP d’inscription et la récupération de mot de passe.
* Configurer les **Redirect URL(s)** Supabase Auth pour l’URL réelle de l’application (GitHub Pages ou environnement local).
* Prévoir une table `profiles` avec au minimum `id`, `email`, `name` et une colonne de spécialité nommée `specialty` ou `speciality`, ainsi que des politiques RLS permettant à l’utilisateur authentifié de lire/écrire son propre profil.
* Prévoir une table `questions` (colonnes : `id` unique, `theme_id`, `q`, `r`, `correct`) avec `r` stocké comme tableau JSON/JSONB et règles de lecture/écriture adaptées à l’administration.
* Prévoir une table `quiz_results` (colonnes : `id` unique, `candidate_id`, `label`, `email`, `name`, `theme`, `score`, `correct`, `wrong`, `skipped`, `total`, `date`, `created_at`) avec `created_at` alimenté automatiquement (timestamp par défaut) pour l’ordre d’affichage.
* Appliquer `supabase/migrations/20261004105000_create_question_reports.sql` pour créer la table de signalements et ses règles RLS, puis `supabase/migrations/20261004121500_allow_admin_delete_question_reports.sql` pour autoriser leur suppression par un administrateur. Les candidats authentifiés peuvent seulement soumettre leurs propres signalements ; la consultation, le traitement et la suppression sont réservés aux administrateurs.
* Exécuter aussi la migration qui crée la fonction RPC publique `get_public_global_campaign_top3()` (champs `display_name`, `score`, `created_at`) et accorde `EXECUTE` à `anon`/`authenticated` pour afficher le Top 3 de connexion sans ouvrir `quiz_results` en lecture anonyme.
* Ne passer `supabase-profiles-rls` à `verified` qu’après validation effective de ces règles côté projet ; sinon la finalisation du profil est bloquée par l’application.
* Les comptes administrateurs doivent aussi être couverts par des règles RLS côté Supabase, cohérentes avec les claims `app_metadata.role = admin` ou `app_metadata.bm4_admin = true`.

### Notifications Android des signalements

Les administrateurs peuvent activer les notifications depuis Chrome sur Android avec
« Activer les notifications sur ce téléphone », puis utiliser le bouton de test.
L'application peut être installée sur l'écran d'accueil. Android affiche un badge
selon le lanceur et les réglages des notifications ; ce badge n'est pas un compteur
garanti des signalements non traités. La déconnexion administrateur désactive
l'abonnement sur cet appareil.

Configuration serveur :

1. Générer une paire de clés VAPID et un secret aléatoire pour le webhook, sans
   les enregistrer dans Git. Conserver les clés VAPID lors des redéploiements.
2. Ajouter les secrets `QCM_VAPID_PUBLIC_KEY`, `QCM_VAPID_PRIVATE_KEY` et
   `QCM_REPORT_PUSH_WEBHOOK_SECRET` dans les secrets des Edge Functions Supabase.
3. Enregistrer le même secret de webhook dans Supabase Vault, sous le nom
   `qcm_report_push_webhook_secret`.
4. Déployer `supabase/functions/report-push/index.ts` sous le nom `report-push`,
   avec `verify_jwt = false` (voir `supabase/config.toml`). La fonction vérifie
   elle-même le secret des événements et l'identité des administrateurs pour les tests.
5. Appliquer `supabase/migrations/20261004130000_admin_report_push.sql`.
   Cette migration crée les abonnements protégés par RLS et un trigger asynchrone
   `pg_net` sur les nouveaux signalements. Adapter l'URL du projet dans le trigger
   si l'application est déployée sur un autre projet Supabase.

Seuls les endpoints Chrome/FCM sont acceptés. Le contenu envoyé ne contient ni
e-mail ni texte de la question. Le service worker ne met pas les pages en cache.
Les abonnements expirés sont retirés après une réponse 404/410 du service push.
Surveiller les logs `report-push` et `net._http_response` en cas d'échec de livraison :
un webhook `pg_net` n'offre pas de garantie de relivraison automatique.

Le flux candidat attendu est :

1. Inscription avec email + mot de passe + profil candidat
2. Réception du code OTP par email
3. Vérification OTP dans l’interface
4. Finalisation du profil dans `profiles`
5. Connexion email/mot de passe et récupération de mot de passe via email

### Diagnostic rapide si le bouton « Créer mon compte » semble ne rien faire

- Si un champ requis est vide ou invalide (email, mot de passe < 6 caractères, spécialité non choisie), l’application doit maintenant afficher la cause directement dans `register-message`.
- Si le message indique qu’il est impossible de joindre Supabase, vérifier :
  - la valeur de `meta[name="supabase-url"]`,
  - l’activation du fournisseur Email et des Redirect URL Supabase Auth,
  - un éventuel cache GitHub Pages côté navigateur (forcer le rechargement),
  - l’absence de blocage réseau/extension navigateur sur les appels `.../auth/v1/signup` et `.../auth/v1/verify`.

---
