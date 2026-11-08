# QCM-MAJOR

QCM-MAJOR est une application web de préparation au Brevet militaire de 4e niveau (BM4). Elle permet de réviser avec des quiz thématiques ou une campagne globale, puis de consulter son score et ses réponses.

## Fonctionnalités

- Création de compte et connexion avec Supabase.
- Quiz avec chronomètre, correction et bilan pédagogique.
- Historique des résultats et classement public.
- Signalement des questions à corriger.
- Espace d’administration pour gérer les comptes, les questions et les résultats.
- Interface adaptée aux mobiles et installable comme application PWA.
- Badge numérique sur l’icône de la PWA installée pour les signalements à traiter, sur les navigateurs compatibles.

## Fonctionnement

Le frontend est développé en HTML, CSS et JavaScript, sans étape de compilation, et hébergé sur GitHub Pages. Supabase gère l’authentification, les données et la correction des réponses.

À l’ouverture sans session active, la question « Est-ce votre première visite ? » propose « Oui » pour rallier l’unité (connexion) et « Non » pour s’engager (création de compte). Les onglets restent accessibles ensuite pour changer de formulaire.

Les quiz nécessitent une connexion Internet : le jeu hors ligne n’est pas disponible.

Le blocage et le déblocage des comptes candidats utilisent la migration `supabase/migrations/20261108152100_add_admin_account_blocking.sql`. Appliquez-la au projet Supabase avant de déployer cette fonctionnalité ; seuls les administrateurs peuvent modifier le statut d’un compte.

Depuis la page Aide, le lien vers l'Armoire numérique de campagne ouvre un nouvel onglet et transmet temporairement le jeton d'accès de la session connectée, sans transmettre le mot de passe ni le jeton de rafraîchissement. Conservez QCM-MAJOR ouvert pour renouveler l'accès ; si la connexion automatique échoue, utilisez le formulaire de connexion de l'armoire.

Depuis le module 5 de l'Armoire ouverte par ce lien, le retour vers QCM-MAJOR réutilise cet onglet et affiche la console si la même session candidate est active. Une partie en cours reste affichée et n'est pas interrompue.

## Classement public

Le Top 3 de la campagne globale affiché sur l’écran de connexion est chargé via la fonction RPC publique `get_public_global_campaign_top3()`, sans accès anonyme direct à la table `quiz_results`.

## Badge de l’application

Sur un navigateur compatible avec l’API Badging, l’icône de la PWA installée affiche le nombre de signalements non résolus pour les administrateurs. Le compteur est recalculé à l’ouverture des signalements et transmis avec les notifications push ; il est effacé lorsqu’il n’y a plus de signalements en attente ou à la déconnexion. Cette fonction dépend du support du navigateur et de l’installation de l’application sur l’écran d’accueil ou le bureau.

## Démarrage local

Avec Python installé, lancer un serveur local à la racine du dépôt :

```bash
python -m http.server 8000
```

Puis ouvrir <http://localhost:8000>.

## Tests

Avec Node.js installé, lancer les tests avec :

```bash
node --test tests/*.test.mjs
```
