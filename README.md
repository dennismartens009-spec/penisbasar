# Penisbasar – Marktplatz für unseren Minecraft-Server

Angebote einstellen und reservieren – wie bei Vinted. Bezahlt wird mit Diamanten,
übergeben wird im Spiel. Alle Spieler sehen denselben Marktplatz (Supabase-Datenbank).

**Einrichten & online stellen:** siehe [ANLEITUNG.md](ANLEITUNG.md).

## So funktioniert der Handel

1. Ein Spieler stellt ein Angebot ein → **verfügbar**
2. Ein anderer klickt **Kaufen** (oder sein **Preisvorschlag** wird angenommen) → **reserviert** für ihn
3. Beide treffen sich im Spiel: Diamanten gegen Items
4. Der Verkäufer markiert **verkauft** → der Käufer kann bewerten

Reservierungen kann der Verkäufer aufheben und der Käufer selbst stornieren.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Grundgerüst: Kopfzeile, Handy-Navigation |
| `css/style.css` | Das komplette Design (Farben ganz oben als Variablen) |
| `js/config.js` | **Hier kommen deine Supabase-Zugangsdaten rein** |
| `js/data.js` | Kategorien und Block-Texturen |
| `js/pixel.js` | Zeichnet die 3D-Pixel-Würfel und Spielerköpfe |
| `js/app.js` | Die App-Logik: Seiten, Kaufen/Reservieren, Preisvorschläge, Bewertungen |
| `supabase/schema.sql` | Tabellen und Sicherheitsregeln (im Supabase SQL Editor ausführen) |
| `supabase/seed.sql` | Optionale Beispieldaten |

## Sicherheit in Kürze

- Anmeldung mit Minecraft-Name + PIN (die PIN wird nur verschlüsselt gespeichert)
- Jeder kann nur **seine eigenen** Angebote bearbeiten und löschen
- Status, Käufer und vereinbarter Preis ändern sich nur über geprüfte Datenbank-Funktionen
- Preisvorschläge sehen nur der Käufer und der Verkäufer
