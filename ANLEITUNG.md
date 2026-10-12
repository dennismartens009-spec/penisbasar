# Penisbasar einrichten und online stellen

Zwei kostenlose Dienste:

- **Supabase** speichert die Daten (Spieler, Angebote, Bewertungen) für alle gemeinsam.
- **Netlify** (oder GitHub Pages) stellt die Website online, damit deine Freunde sie per Link öffnen.

Dauer: etwa 15 Minuten.

---

## Teil 1: Datenbank bei Supabase anlegen

### 1. Projekt erstellen
1. Gehe auf **supabase.com** → „Start your project“ und melde dich an (z. B. mit GitHub oder E-Mail).
2. Klicke **New project**.
   - Name: z. B. `penisbasar`
   - Database Password: irgendein sicheres Passwort (brauchst du für die Website nicht)
   - Region: **Central EU (Frankfurt)**
3. Warte, bis das Projekt fertig eingerichtet ist (1–2 Minuten).

### 2. Tabellen und Regeln anlegen
1. Links im Menü: **SQL Editor** → **New query**.
2. Öffne die Datei `supabase/schema.sql`, kopiere den **kompletten** Inhalt hinein und klicke **Run**.
   Es sollte „Success. No rows returned“ erscheinen.
3. *Optional:* Neue Abfrage, Inhalt von `supabase/seed.sql` einfügen, **Run** – dann gibt es Beispiel-Angebote.
   ⚠️ Nur **einmal** ausführen, sonst sind die Angebote doppelt da.

### 3. Anmeldung einschalten
1. Links: **Authentication** → **Sign In / Providers** (manchmal nur „Providers“ oder unter „Configuration“).
2. Schalte **„Allow anonymous sign-ins“** ein und speichere.

> Warum „anonym“? Jeder Browser bekommt beim Anmelden automatisch eine unsichtbare Sitzung.
> Die Website verknüpft diese Sitzung mit deinem Minecraft-Namen und deiner PIN.
> E-Mail-Adressen oder Passwörter braucht niemand.

### 4. Zugangsdaten in die Website eintragen
1. Links: **Project Settings** → **API Keys** (oder oben im Dashboard der Button **Connect**).
2. Kopiere:
   - die **Project URL** (sieht aus wie `https://abcdefgh.supabase.co`)
   - den **Publishable key** (`sb_publishable_…`) – oder, falls nur der angezeigt wird, den **anon public** Key
3. Trage beides in `js/config.js` ein:

```js
const SUPABASE_URL = 'https://abcdefgh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xxxxxxxxxxxx';
```

> ✅ Dieser Key darf öffentlich sein – die Regeln aus `schema.sql` schützen die Daten.
> ❌ Trage **niemals** den `service_role`- oder `secret`-Key ein. Der hebelt alle Regeln aus.

### 5. Lokal testen
Öffne `index.html` per Doppelklick. Statt des Hinweises „Datenbank verbinden“ solltest du jetzt den Marktplatz sehen.
Melde dich mit deinem Minecraft-Namen an und denk dir eine PIN aus.

---

## Teil 2: Kostenlos online stellen

### Variante A: Netlify Drop (am einfachsten, ohne Programme)
1. Gehe auf **app.netlify.com** und erstelle ein kostenloses Konto.
2. Öffne **app.netlify.com/drop**.
3. Ziehe den ganzen Ordner `minecraft shop` in das Feld.
4. Nach ein paar Sekunden bekommst du einen Link wie `https://zufaelliger-name-123.netlify.app`.
5. Unter **Site configuration → Change site name** kannst du daraus z. B. `penisbasar.netlify.app` machen (falls der Name noch frei ist).

**Updates:** Im Netlify-Dashboard deiner Seite → **Deploys** → den Ordner erneut in das Feld ziehen.

### Variante B: GitHub Pages (gut, wenn du später öfter änderst)
1. Konto auf **github.com** anlegen → **New repository** (z. B. `penisbasar`, *Public*).
2. „uploading an existing file“ wählen und den **Inhalt** des Ordners hochladen (`index.html`, `css`, `js`, `supabase`, …).
3. Im Repository: **Settings → Pages** → Source: „Deploy from a branch“, Branch: `main`, Ordner `/ (root)` → **Save**.
4. Nach 1–2 Minuten ist die Seite unter `https://DEIN-NAME.github.io/penisbasar/` erreichbar.

---

## Gut zu wissen

- **Supabase pausiert kostenlose Projekte nach 7 Tagen ohne Nutzung.** Dann zeigt die Website „Marktplatz konnte nicht geladen werden“.
  Im Supabase-Dashboard kannst du das Projekt mit einem Klick wieder starten („Restore project“). Solange regelmäßig jemand handelt, passiert das nicht.
- **PIN vergessen?** Im Supabase **SQL Editor** ausführen (Name anpassen):
  `delete from public.player_secrets where name = 'DeinName';`
  Danach kann der Spieler beim nächsten Anmelden eine neue PIN festlegen. Er sollte das sofort tun,
  denn bis dahin könnte sich jeder mit diesem Namen eine PIN setzen.
- **Beispieldaten entfernen:** Die Befehle stehen ganz unten in `supabase/seed.sql`.
- **Alle Daten ansehen oder korrigieren:** Supabase → **Table Editor**. Dort hast du als Admin vollen Zugriff.
