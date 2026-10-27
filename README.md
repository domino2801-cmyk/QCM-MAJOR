# QCM-MAJOR

QCM-MAJOR est une application web de préparation au Brevet militaire de 4e niveau (BM4). Elle permet de réviser avec des quiz thématiques ou une campagne globale, puis de consulter son score et ses réponses.

## Fonctionnalités

- Création de compte et connexion avec Supabase.
- Quiz avec chronomètre, correction et bilan pédagogique.
- Historique des résultats et classement public.
- Signalement des questions à corriger.
- Espace d’administration pour gérer les comptes, les questions et les résultats.
- Interface adaptée aux mobiles et installable comme application PWA.

## Fonctionnement

Le frontend est développé en HTML, CSS et JavaScript, sans étape de compilation, et hébergé sur GitHub Pages. Supabase gère l’authentification, les données et la correction des réponses.

Les quiz nécessitent une connexion Internet : le jeu hors ligne n’est pas disponible.

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
