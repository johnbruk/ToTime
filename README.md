# TOTIME Web App / PWA v0.7.2

Database Edition con Supabase/PostgreSQL.

## Novità v0.7.2

- Login separato dalla registrazione.
- Form di registrazione dedicato con Nome, Cognome, Azienda/Ragione sociale, P.IVA, Email e Password.
- Nuova tabella `user_profiles` per salvare i dati profilo collegati all'utente Supabase.
- Messaggi più chiari in fase di accesso/registrazione.
- Dopo la registrazione, l’app torna automaticamente alla pagina di login.
- L’utente deve poi accedere con le credenziali appena scelte.
- Service worker/cache aggiornati a v0.7.2.

## Prima di pubblicare

Prima di caricare questa versione su GitHub/Netlify, eseguire in Supabase lo script:

`supabase_migration_v0.7.1_user_profiles.sql`

Il progetto continua a usare Supabase come database principale.
