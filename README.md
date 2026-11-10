# QCM-MAJOR

QCM-MAJOR est une application web de préparation au Brevet militaire de 4e niveau (BM4). Elle propose des quiz d’entraînement, suit les résultats et donne accès depuis un centre commun à deux espaces complémentaires : l’Armoire numérique de campagne et le forum BM4 sur Tchap.

## Parcours utilisateur

### 1. Se connecter ou créer un compte

Sans session active, l’application demande « Est-ce votre première visite ? » :

- **Non — Rallier l’unité** : ouvrir le formulaire de connexion avec un compte candidat existant ;
- **Oui — S’engager** : ouvrir la création de compte.

Les formulaires permettent aussi de basculer entre connexion et inscription, et de demander un lien de récupération du mot de passe. L’authentification est gérée par Supabase.

### 2. Choisir son espace

Après connexion, le centre d’entraînement affiche trois accès :

| Espace | Fonction |
| --- | --- |
| **Question pour un Major** | Accéder aux zones QCM, choisir un thème ou une campagne et s’entraîner. |
| **Armoire numérique de campagne** | Ouvrir les modules de préparation BM4 dans DOCTRINE. |
| **FORUM — Tchap BM4** | Rejoindre le salon d’échange BM4 sur Tchap. |

Le bouton **« Choix des espaces »**, disponible depuis les QCM, ramène au centre.

#### Armoire numérique de campagne

Le lien du centre ouvre l’Armoire dans un nouvel onglet. Si une session candidate QCM-MAJOR est active, l’accès transmet temporairement à l’Armoire le jeton d’accès nécessaire à la connexion automatique ; le mot de passe et le jeton de rafraîchissement ne sont pas transmis. Gardez QCM-MAJOR ouvert pour permettre le renouvellement de l’accès. Si la connexion automatique échoue, connectez-vous depuis le formulaire de l’Armoire.

Depuis le compte administrateur, **« Admin ANC »** ouvre également l’Armoire avec la session en cours. Dans un module de l’Armoire, son bouton **« Admin »** active les commandes d’administration correspondantes.

Depuis le module 5 de l’Armoire ouverte par ce parcours, le retour vers QCM-MAJOR réutilise l’onglet d’origine. Si la même session candidate est toujours active, l’application revient à la console ; un QCM ou un signalement déjà ouvert n’est pas interrompu.

#### Forum BM4 sur Tchap

Le bouton **« FORUM »** ouvre le salon BM4 sur [Tchap](https://tchap.gouv.fr/#/room/#Bm4QCArLJuiyp:agent.intradef.tchap.gouv.fr). Lors de votre première arrivée, présentez-vous au format indiqué dans l’application :

> ADC « Nom » du « Régiment », spécialité « XXX ».

L’accès au salon dépend de Tchap et de votre compte sur ce service.

## Entraînement et progression

- Quiz thématiques et campagnes globales, avec chronomètre, correction et bilan pédagogique.
- Réponses vérifiées par Supabase ; une connexion Internet est nécessaire pour jouer. Le jeu hors ligne n’est pas disponible.
- Historique des résultats, journal de campagne et classement public.
- Signalement d’une question à corriger, avec commentaire et niveau de priorité.
- La progression commence au palier de 10 questions. Les seuils de déblocage sont : **12/20 sur 10 questions**, **13/20 sur 20**, **14/20 sur 30** et **15/20 sur 40**, pour débloquer respectivement les paliers 20, 30, 40 et 50 questions.
- Le score brut est de **+4** par bonne réponse, **−1** par mauvaise réponse et **0** par question passée. Les résultats synchronisés antérieurs sont pris en compte ; un résultat de 50 questions débloque aussi le palier 50. Les deux modes de 50 questions sont verrouillés avant ce déblocage.

Les meilleurs scores et le palier sont conservés dans `user_progress`. Les politiques RLS isolent les comptes, mais les valeurs de progression restent modifiables par leur propriétaire et ne constituent pas une protection contre la triche.

## Administration QCM-MAJOR

L’espace administrateur permet de gérer les comptes, les questions, les résultats et les signalements. La fiche de suivi par candidat présente ses résultats récents, ses moyennes et tendances par thème, sa progression enregistrée, ses consultations de ressources et signalements dans DOCTRINE, les signalements de questions dans QCM-MAJOR, les transmissions de fiches et la dernière activité observée dans chaque application. Le filtre de période s’applique à une chronologie commune. Les commentaires libres ne sont pas recopiés dans cette fiche ; une consultation est un clic enregistré, pas une preuve de lecture.

La synthèse globale fournit des indicateurs descriptifs filtrables par spécialité, période, étape observée et statut d’activité. Le seuil « sans activité » est réglable (30 jours par défaut). Les effectifs par étape ne constituent ni un classement ni un score de performance. L’export CSV porte uniquement sur une sélection filtrée et contient le nom/pseudo, l’e-mail, la spécialité, l’étape observée et les dates de dernière activité dans chaque application ; un filtre doit être appliqué avant de l’activer.

Les comptes candidats peuvent être bloqués ou débloqués par un administrateur. Les notifications push de signalement sont facultatives et dépendent du navigateur ; sur les navigateurs compatibles avec l’API Badging, l’icône de la PWA installée peut aussi afficher le nombre de signalements à traiter.

## Configuration Supabase

Le frontend est développé en HTML, CSS et JavaScript sans étape de compilation. Supabase fournit l’authentification, les données et la correction des réponses. Appliquez les migrations nécessaires au projet Supabase avant de déployer les fonctionnalités concernées.

### Progression

Appliquez ces migrations dans l’ordre :

1. `supabase/migrations/20261108180000_add_user_progress.sql`
2. `supabase/migrations/20261108190000_reconcile_user_progress_from_results.sql`
3. `supabase/migrations/20261108193000_reconcile_all_candidate_progress.sql`
4. `supabase/migrations/20261108200000_update_progress_thresholds.sql`

La dernière migration recalcule les paliers avec les seuils actuels sans réduire les paliers déjà acquis.

### Blocage des comptes et journal administrateur

- Appliquez `supabase/migrations/20261108152100_add_admin_account_blocking.sql` pour activer le blocage des comptes candidats. Seuls les administrateurs peuvent modifier leur statut.
- Appliquez `supabase/migrations/20261108195000_admin_candidate_progress.sql` pour permettre au journal administrateur de lire l’intensité débloquée, y compris pour les candidats sans résultat.
- Appliquez d’abord les schémas DOCTRINE `documentation-consultations.sql`, `fiche-submissions.sql`, `progression-events.sql` et `retex-signalements.sql`, puis `supabase/migrations/20261110120000_admin_candidate_tracking.sql`. Cette fonction protégée par rôle admin fournit uniquement les métadonnées nécessaires au suivi ; elle ne retourne ni les détails des signalements ni les URL des documents.
- Appliquez ensuite `supabase/migrations/20261110140000_admin_candidate_overview.sql` pour activer les indicateurs globaux. Cette migration suppose aussi que `user_progress` et `retex_responses` existent. Les deux fonctions de synthèse vérifient le rôle administrateur côté base.

### Classement public

Le Top 3 de la campagne globale, affiché avant connexion, est chargé par la fonction RPC publique `get_public_global_campaign_top3()`, sans accès anonyme direct à la table `quiz_results`. Le classement affiche le pseudo, la note et la date ; choisissez un pseudo qui ne révèle pas votre identité.

## PWA, hébergement et mode hors ligne

L’application est un site statique hébergé sur GitHub Pages et installable comme PWA. Le service worker met en cache les ressources locales de l’application ; les quiz, la correction, Tchap et les documents ou services distants nécessitent une connexion Internet.

Pour le déploiement, publier le site avec GitHub Pages sur HTTPS et vérifier que les chemins relatifs des ressources fonctionnent à la racine du dépôt. Après une première visite en ligne, le navigateur peut proposer l’installation de la PWA.

## Démarrage local

Avec Python installé, lancer un serveur HTTP à la racine du dépôt :

```bash
python -m http.server 8000
```

Puis ouvrir <http://localhost:8000>.

## Tests

Avec Node.js installé, exécuter les tests :

```bash
node --test tests/*.test.mjs
```

## Publication

Depuis `main`, lancer une publication complète avec un message de commit :

```bash
npm run release -- "Décrire les changements"
```

La commande vérifie que le dépôt est synchronisé avec `origin/main`, exécute tous les tests, ajoute tous les changements (y compris les nouveaux fichiers), crée le commit avec le co-auteur Copilot, pousse sur `main` et attend la réussite du déploiement GitHub Pages. Elle s’arrête si les prérequis ne sont pas réunis ou si une étape échoue. Elle nécessite Git, GitHub CLI authentifié (`gh auth login`) et Node.js.

## Captures d’écran du parcours candidat

Le script Playwright ouvre l’application locale au format 375 × 812 px et utilise des réponses Supabase simulées. Il enregistre des captures du parcours candidat — connexion, récupération du mot de passe, centre, briefing, quiz, signalement, bilan, historique et RETEX — dans `screenshots_mobile_candidat/`.

Installation et lancement :

```bash
npm install
npx playwright install chromium
npm run screenshots:mobile
```
