# Question pour un Major - Édition Tactique 🎖️


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
│   └── style.css              # Style militaire (HUD, couleurs, animations)
│
├── public/
│   ├── images/                # Logos, décor, icônes
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
│   ├── ui-controller/         # Gestion de l’interface
│   │   └── index.js           # Changement d’écran, marquage visuel
│   │
│   ├── core/
│   │   ├── router.js          # Navigation interne (menu → mission → bilan)
│   │   └── events.js          # Bus d’événements tactiques
│   │
│   └── stats/
│       └── index.js           # Statistiques, historique, export

```

## 🛠️ Technologies Utilisées

* **Frontend :** HTML5, CSS3, JavaScript (Vanilla ES6)
* **Authentification :** Supabase Auth (email/password, OTP signup, recovery)
* **Persistance (Locale) :** `localStorage` (pour la sauvegarde des questions et résultats)
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
<meta name="supabase-url" content="https://<votre-projet>.supabase.co">
<meta name="supabase-anon-key" content="<votre-anon-key>">
<meta name="supabase-profiles-rls" content="verified">
```

Prérequis côté Supabase :

* Activer le fournisseur **Email** pour l’OTP d’inscription et la récupération de mot de passe.
* Configurer les **Redirect URL(s)** Supabase Auth pour l’URL réelle de l’application (GitHub Pages ou environnement local).
* Prévoir une table `profiles` avec au minimum `id`, `email`, `name`, `specialty`, et des politiques RLS permettant à l’utilisateur authentifié de lire/écrire son propre profil.
* Ne passer `supabase-profiles-rls` à `verified` qu’après validation effective de ces règles côté projet ; sinon la finalisation du profil est bloquée par l’application.

Le flux candidat attendu est :

1. Inscription avec email + mot de passe + profil candidat
2. Réception du code OTP par email
3. Vérification OTP dans l’interface
4. Finalisation du profil dans `profiles`
5. Connexion email/mot de passe et récupération de mot de passe via email
