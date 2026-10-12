/* ==========================================================
   Penisbasar – Verbindung zu Supabase
   Beide Werte findest du in Supabase unter
   Project Settings → API (bzw. "Connect" oben im Dashboard).

   Der Publishable/anon Key darf öffentlich im Code stehen –
   die Sicherheitsregeln in supabase/schema.sql schützen die Daten.
   NIEMALS den "service_role"- oder "secret"-Key hier eintragen!
   ========================================================== */

const SUPABASE_URL = 'https://kkxabgoupautlebtlwfl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7kuGdMy7AZ2GZA28vkiXnQ_EF2pNSx7';
