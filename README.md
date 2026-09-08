# Question pour un Major - Édition Tactique 🎖️


**Question pour un Major - Édition Tactique** est une application web de quiz (QCM) interactive conçue pour accompagner les militaires dans leur préparation au **Brevet Militaire de 4e niveau (BM4)**. 

Le site permet aux candidats de tester leurs connaissances à travers différentes thématiques clés de la culture militaire et offre aux administrateurs une interface dédiée pour gérer le contenu pédagogique.

🔗 **Démo en ligne :** [Visiter le site](https://github.io)

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
├── index.html              # Page principale (Portail, Quiz et Admin)
├── README.md               # Documentation du projet
├── assets/                 # Médias et ressources globales
│   └── img/                # Logos, insignes, icônes tactiques
│       └── logo.png
├── css/                    # Styles de l'application
│   ├── style.css           # Design global, variables et mise en page
│   └── components/         # Architecture CSS modulaire
│       ├── admin.css       # Style spécifique à l'interface admin
│       └── quiz.css        # Style spécifique aux cartes de questions
└── js/                     # Logique JavaScript
    ├── app.js              # Point d'entrée principal (Initialisation et routage)
    ├── data.js             # Base de données de questions par défaut (JSON/Tableaux)
    ├── auth.js             # Gestion des sessions (Inscriptions, connexions Candidat & Admin)
    ├── quiz.js             # Moteur du QCM (Navigation, chronomètre, calcul des notes sur 20)
    └── admin.js            # Fonctions de gestion (CRUD questions, nettoyage des doublons)
```

---

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

## 🤝 Contribution

Les contributions pour enrichir la base de questions ou améliorer l'interface sont les bienvenues !
1. Créez un *Fork* du projet.
2. Créez votre branche de fonctionnalité (`git checkout -b feature/AjoutQuestions`).
3. Commitez vos modifications (`git commit -m 'Ajout de 20 questions OPEX'`).
4. Poussez la branche (`git push origin feature/AjoutQuestions`).
5. Ouvrez une *Pull Request*.

