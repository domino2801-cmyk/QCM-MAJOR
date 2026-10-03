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
L'interface administrateur ne permet plus de supprimer une note ni d'effacer
l'ensemble des résultats. La consultation, la recherche et les filtres restent
disponibles ; les politiques Supabase ne sont pas modifiées par ce changement.
Les historiques candidat et administrateur affichent la moyenne des seules
Campagnes Globales de la période, ou leur absence explicite. Les listes de période
et le filtre candidat des résultats utilisent un fond blanc et un texte noir,
y compris dans leurs options déroulantes.


**Question pour un Major - Édition Tactique** est une application web de quiz (QCM) interactive conçue pour accompagner les militaires dans leur préparation au **Brevet Militaire de 4e niveau (BM4)**. 

Le site permet aux candidats de tester leurs connaissances à travers différentes thématiques clés de la culture militaire et offre aux administrateurs une interface dédiée pour gérer le contenu pédagogique.

---

## 🚀 Fonctionnalités

### 👨‍🎓 Espace Candidat
* **Inscription et Connexion :** Authentification Supabase avec vérification OTP email à l’inscription.
* **Mot de passe oublié :** Envoi d’un lien de récupération puis définition d’un nouveau mot de passe au retour dans l’application.
* **Campagnes de Révision :** Lancement d'une "Campagne Globale" ou entraînement par thématique ciblée.
* **Système de Notation :** Évaluation dynamique avec un score final sur **20 points**.
* **Bilan Pédagogique :** Résumé détaillé en fin de partie (réponses correctes, fausses, sautées) et rappel des questions à revoir.

### ⚙️ Interface Administrateur
Une zone d'administration sécurisée est intégrée pour centraliser la gestion de l'application :
* **Gestion des comptes :** Visualisation et suivi des candidats inscrits.
* **Gestion des questions :** Ajout, modification, suppression et dédoublonnage automatique des QCM.
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
* Exécuter aussi la migration qui crée la fonction RPC publique `get_public_global_campaign_top3()` (champs `display_name`, `score`, `created_at`) et accorde `EXECUTE` à `anon`/`authenticated` pour afficher le Top 3 de connexion sans ouvrir `quiz_results` en lecture anonyme.
* Ne passer `supabase-profiles-rls` à `verified` qu’après validation effective de ces règles côté projet ; sinon la finalisation du profil est bloquée par l’application.
* Les comptes administrateurs doivent aussi être couverts par des règles RLS côté Supabase, cohérentes avec les claims `app_metadata.role = admin` ou `app_metadata.bm4_admin = true`.

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
