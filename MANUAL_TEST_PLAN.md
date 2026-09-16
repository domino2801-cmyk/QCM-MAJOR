# Plan de tests manuels complet — QCM-MAJOR

## Portée de la campagne
- Cible: branche courante du dépôt `QCM-MAJOR` contenant les flux Supabase (auth, admin, résultats, recovery).
- Fonctionnalités requises pour exécuter les cas C2 à C7:
  - stockage local `bm4-results`,
  - synchronisation différée des résultats offline/online,
  - flux recovery avec paramètre `auth=recovery`.
- Le script SQL est à exécuter dans Supabase SQL Editor avec un rôle privilégié (lecture `auth.users`).

## 1) Préparation (pré-requis)

### 1.1 Environnement
- Exécuter `supabase_manual_test_setup.sql` dans Supabase SQL Editor.
- Vérifier que les tables `profiles`, `questions`, `quiz_results` existent et que RLS est actif.
- Vérifier la présence des 2 doublons volontaires dans `questions` (`seed-dup-a`, `seed-dup-b`).
- Vérifier qu’il n’y a plus de résultats pour les 4 comptes de test (`@qcm-major.test`).
- Note: `quiz_results` n’est pas pré-rempli; les résultats de référence sont générés pendant l’exécution des cas quiz.

### 1.2 Configuration application
- Renseigner dans `index.html`:
  - `meta[name="supabase-url"]`
  - `meta[name="supabase-anon-key"]`
  - `meta[name="supabase-profiles-rls"]` avec `verified`.

### 1.3 Jeux de comptes de test
- `candidat-ok@qcm-major.test` (OTP validé)
- `candidat-pending@qcm-major.test` (OTP non validé)
- `admin-ok@qcm-major.test` (claim admin)
- `user-noadmin@qcm-major.test` (authentifié sans claim admin)
- Après création des comptes dans Supabase Auth, relancer le script SQL pour (re)générer automatiquement les lignes `profiles` de ces 4 comptes.

---

## 2) Format d’exécution (obligatoire pour chaque cas)

Pour chaque cas, renseigner:
- **Précondition**
- **Étapes**
- **Résultat attendu**
- **Résultat observé**
- **Statut**: ✅ PASS / ❌ FAIL / ⏸ BLOQUÉ

---

## 3) Cas de tests détaillés

## A. Parcours candidat (auth + quiz)

### A1 — Connexion
| ID | Précondition | Étapes | Résultat attendu | Résultat observé | Statut |
|---|---|---|---|---|---|
| A1.1 | Compte `candidat-ok` existe | Login email+mot de passe valides | Accès écran thèmes |  |  |
| A1.2 | Compte `candidat-ok` existe | Login mot de passe invalide | Message “Adresse mail ou mot de passe incorrect.” |  |  |
| A1.3 | Compte `candidat-pending` non confirmé | Login | Message “Adresse mail non confirmée...” |  |  |

### A2 — Inscription
| ID | Précondition | Étapes | Résultat attendu | Résultat observé | Statut |
|---|---|---|---|---|---|
| A2.1 | Écran register | Soumettre avec champ requis manquant | Blocage navigateur / message requis |  |  |
| A2.2 | Écran register | Mot de passe < 6 | Message longueur mini |  |  |
| A2.3 | Email déjà utilisé | Inscription avec email existant | Message “Un compte existe déjà...” |  |  |
| A2.4 | Nouvel email | Inscription valide | Bascule écran OTP + email affiché |  |  |

### A3 — OTP
| ID | Précondition | Étapes | Résultat attendu | Résultat observé | Statut |
|---|---|---|---|---|---|
| A3.1 | OTP reçu | Saisie OTP valide | Profil finalisé + accès app |  |  |
| A3.2 | OTP invalide | Saisie code faux | Message “Code OTP invalide ou expiré.” |  |  |
| A3.3 | OTP expiré | Saisie code expiré | Message expiration |  |  |
| A3.4 | Vue OTP | Cliquer retour | Retour vue inscription |  |  |

### A4 — Profil/RLS candidat
| ID | Précondition | Étapes | Résultat attendu | Résultat observé | Statut |
|---|---|---|---|---|---|
| A4.1 | Utilisateur authentifié sans profil lisible | Login | Refus accès + message profil non finalisé |  |  |
| A4.2 | Simuler erreur RLS/lecture profil | Login | Message indisponibilité profil |  |  |

### A5 — Mot de passe oublié / recovery
| ID | Précondition | Étapes | Résultat attendu | Résultat observé | Statut |
|---|---|---|---|---|---|
| A5.1 | Compte existant | Demande lien reset | Message envoi lien |  |  |
| A5.2 | Lien reçu | Ouvrir lien Supabase | Ouverture mode reset (recovery) |  |  |
| A5.3 | Mode reset | Nouveau mdp + confirmation identiques | Message succès + retour login |  |  |
| A5.4 | Mode reset | Mdp et confirmation différents | Message mismatch |  |  |
| A5.5 | Nouveau mdp défini | Reconnexion | Connexion réussie |  |  |

### A6 — Session candidat
| ID | Précondition | Étapes | Résultat attendu | Résultat observé | Statut |
|---|---|---|---|---|---|
| A6.1 | Candidat connecté | Déconnexion | Retour écran login |  |  |
| A6.2 | Candidat connecté | Recharger la page | Session restaurée correctement |  |  |

### A7 — Quiz + bilan
| ID | Précondition | Étapes | Résultat attendu | Résultat observé | Statut |
|---|---|---|---|---|---|
| A7.1 | Candidat connecté | Choisir thème+quantité puis démarrer | Quiz démarre |  |  |
| A7.2 | Quiz en cours | Répondre juste/faux/passer | Progression et points mis à jour |  |  |
| A7.3 | Fin quiz | Afficher bilan | Note /20 + stats cohérentes |  |  |
| A7.4 | Fin quiz avec fautes/passages | Vérifier revue | Questions à revoir visibles |  |  |
| A7.5 | Fin campagne globale | Vérifier classement | Classement global mis à jour |  |  |

### A8 — Persistance utilisateur
| ID | Précondition | Étapes | Résultat attendu | Résultat observé | Statut |
|---|---|---|---|---|---|
| A8.1 | Résultat enregistré | Recharger page | Résultat toujours présent |  |  |
| A8.2 | Résultat enregistré | Vérifier classement après reload | Cohérence maintenue |  |  |

## B. Parcours admin

### B1 — Accès admin + authentification
| ID | Précondition | Étapes | Résultat attendu | Résultat observé | Statut |
|---|---|---|---|---|---|
| B1.1 | Écran auth | Cliquer bouton ⚙ | Affichage formulaire admin |  |  |
| B1.2 | Compte `admin-ok` | Login admin valide | Accès `admin-screen` |  |  |
| B1.3 | Compte `user-noadmin` | Login via formulaire admin | Refus + message non autorisé |  |  |

### B2 — Navigation et gestion comptes
| ID | Précondition | Étapes | Résultat attendu | Résultat observé | Statut |
|---|---|---|---|---|---|
| B2.1 | Admin connecté | Naviguer Comptes/Questions/Résultats | Sections changent correctement |  |  |
| B2.2 | Comptes en cache | “Retirer du cache” sur un compte | Ligne retirée de la liste |  |  |

### B3 — Gestion questions
| ID | Précondition | Étapes | Résultat attendu | Résultat observé | Statut |
|---|---|---|---|---|---|
| B3.1 | Admin section Questions | Ajouter question | Question visible + persistée |  |  |
| B3.2 | Question existante | Modifier question | Modifications visibles + persistées |  |  |
| B3.3 | Question existante | Supprimer question | Disparition UI + suppression distante |  |  |
| B3.4 | Multi-thèmes | Changer thème | Liste filtrée par thème |  |  |
| B3.5 | Doublons seed présents | Cliquer nettoyage doublons | Nombre supprimé > 0 |  |  |

### B4 — Gestion résultats
| ID | Précondition | Étapes | Résultat attendu | Résultat observé | Statut |
|---|---|---|---|---|---|
| B4.1 | Résultats présents | Supprimer un résultat | Ligne supprimée + classement MAJ |  |  |
| B4.2 | Résultats présents | “Effacer tous les résultats” | Liste vide + classement MAJ |  |  |

### B5 — Session admin
| ID | Précondition | Étapes | Résultat attendu | Résultat observé | Statut |
|---|---|---|---|---|---|
| B5.1 | Admin connecté | Déconnexion admin | Retour écran login |  |  |

## C. Intégration Supabase + robustesse

Méthode d’observation recommandée pour C2 à C7 :
- Supabase Table Editor/SQL :
  - `select id, candidate_id, email, score, created_at from quiz_results order by created_at desc;`
  - `select id, theme_id, q from questions order by created_at desc nulls last;`
  - Avant C2, noter un horodatage de départ (`T0`) puis filtrer `quiz_results` avec `created_at >= T0` pour isoler la tentative.
- Navigateur (DevTools) :
  - `Application > Local Storage` clé `bm4-results` pour vérifier l’email masqué.
  - Barre d’adresse pour vérifier l’ajout/retrait de `auth=recovery`.
- Test offline/online :
  - Couper puis rétablir le réseau via DevTools Network (Offline / Online) avant relance.

| ID | Précondition | Étapes | Résultat attendu | Résultat observé | Statut |
|---|---|---|---|---|---|
| C1 | Supabase provisionné via script | Démarrer app | Questions chargées depuis Supabase et visibles dans l’application |  |  |
| C2 | Candidat connecté, finir un quiz en ligne | Noter l’`id` du résultat en UI (fallback: ligne SQL du candidat avec `created_at >= T0`) | Une ligne cohérente existe dans `quiz_results` (`candidate_id`, `score`, `theme`) |  |  |
| C3 | Résultat visible côté admin | Supprimer le résultat en UI puis relancer la requête SQL sur l’`id` (ou la ligne `created_at >= T0`) | La ligne ciblée n’existe plus dans `quiz_results` |  |  |
| C4 | DevTools en mode Offline avant fin de quiz | Finir un quiz hors ligne puis vérifier Local Storage | Le résultat est présent dans `bm4-results` malgré l’absence réseau |  |  |
| C5 | Cas C4 réussi, repasser Online | Recharger l’app, attendre la synchro, relancer SQL sur `quiz_results` | Le résultat offline apparaît en base après reprise réseau |  |  |
| C6 | Résultat local stocké | Vérifier localStorage `bm4-results` | Champ email masqué (vide) |  |  |
| C7 | Flux recovery | Inspecter URL avant/après | `auth=recovery` ajouté puis nettoyé |  |  |

## D. Sécurité / RLS (obligatoire)
| ID | Précondition | Étapes | Résultat attendu | Résultat observé | Statut |
|---|---|---|---|---|---|
| D1 | Compte candidat simple | Tenter opérations admin | Refus (pas d’accès admin) |  |  |
| D2 | Compte candidat A + compte candidat B | A tente lire/écrire profil B | Refus RLS |  |  |
| D3 | Compte sans claim admin | Tenter login admin | Refus systématique |  |  |
| D4 | Session/token invalide | Actions Supabase protégées | Refus propre + message utilisateur |  |  |

---

## 4) Captures obligatoires à fournir
- OTP valide/invalide
- Recovery reset (écran + succès)
- Refus admin d’un non-admin
- Accès admin d’un vrai admin
- Bilan final quiz
- Purge résultats côté admin
- Extraits Supabase: `profiles`, `questions`, `quiz_results` (avant/après actions clés)

---

## 5) Validation finale (go/no-go)
- 0 cas bloquant sur parcours candidat.
- 0 cas bloquant sur parcours admin.
- Cohérence Supabase/local confirmée (offline/online).
- Contrôles RLS conformes.
- Toutes les captures et observations renseignées.
