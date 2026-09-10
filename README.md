# Question pour un Major - Édition Tactique 🎖️


**Question pour un Major - Édition Tactique** est une application web de quiz (QCM) interactive conçue pour accompagner les militaires dans leur préparation au **Brevet Militaire de 4e niveau (BM4)**. 

Le site permet aux candidats de tester leurs connaissances à travers différentes thématiques clés de la culture militaire et offre aux administrateurs une interface dédiée pour gérer le contenu pédagogique.

---

## 🚀 Fonctionnalités

### 👨‍🎓 Espace Candidat
* **Inscription et Connexion :** Création d'un profil candidat avec suivi par spécialité.
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
