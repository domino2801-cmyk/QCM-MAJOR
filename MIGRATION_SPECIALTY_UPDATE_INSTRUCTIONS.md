# Instruction d'application de la migration Supabase

## Migration: Update Specialty Function with Retex

**Fichier**: `supabase/migrations/20261114112000_update_specialty_function_with_retex.sql`

**Date**: 2026-11-14

**Description**: Améliore la fonction `update_candidate_specialty` pour mettre à jour automatiquement toutes les tables concernées lors du changement de spécialité d'un candidat.

### Tables mises à jour:
1. `auth.users` - Métadonnées de l'utilisateur (spécialité)
2. `public.profiles` - Profil du candidat (colonne `specialty`)
3. `public.retex_responses` - Réponses RETEX (colonne `specialty`)

### Comment appliquer la migration:

#### Option 1: Via Supabase Dashboard (recommandé pour production)
1. Allez à [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Sélectionnez le projet QCM-MAJOR
3. Allez à "SQL Editor"
4. Cliquez sur "New Query"
5. Copiez-collez le contenu du fichier `supabase/migrations/20261114112000_update_specialty_function_with_retex.sql`
6. Cliquez sur "Run"

#### Option 2: Via Supabase CLI (local development)
```bash
cd C:\Users\lised\Desktop\QCM-MAJOR
supabase link --project-ref YOUR_PROJECT_REF
supabase migration up
```

### Vérification après application:

Pour vérifier que la fonction a été mise à jour correctement, exécutez cette requête dans SQL Editor:

```sql
SELECT routine_name, routine_definition 
FROM information_schema.routines 
WHERE routine_name = 'update_candidate_specialty' 
AND routine_schema = 'public';
```

Vous devez voir la fonction contenant:
- `update auth.users`
- `update public.profiles`
- `update public.retex_responses`
- `jsonb_build_object` avec `tables_updated`

### Changement de comportement:

Avant cette migration:
- Seul `auth.users` était mis à jour

Après cette migration:
- `auth.users` est mis à jour ✅
- `public.profiles` est mis à jour ✅
- `public.retex_responses` est mis à jour ✅
- La réponse retourne un rapport détaillé des mises à jour effectuées ✅

### Code d'utilisation depuis app.js:

```javascript
const result = await supabaseRestRequest("/rpc/update_candidate_specialty", {
    method: "POST",
    accessToken: getStoredSupabaseSession()?.access_token,
    body: { p_user_id: account.id, p_new_specialty: newSpecialty }
});
```

La réponse contiendra maintenant:
```json
{
  "user_id": "uuid...",
  "new_specialty": "OG",
  "tables_updated": {
    "auth_users": true,
    "profiles": true,
    "retex_responses": true
  },
  "updated_at": "2026-11-14T11:34:44.526Z"
}
```

---

**Statut**: Migration push le 2026-11-14
**Commit**: ee28b1b
**Branche**: main
