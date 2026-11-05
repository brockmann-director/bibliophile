# Bibliophile

Buchclub-App für **Die Leseratten**: Bücher fotografieren und sammeln, abstimmen, was als Nächstes gelesen wird, Gelesenes bewerten und Termine fürs nächste Treffen finden. Jede Person öffnet die App über ihren persönlichen Link (`?k=…`) und legt sie auf den Homescreen.

- `index.html`: die App (statisch, GitHub Pages)
- `supabase/setup.sql`: Datenbank (Tabellen `bib_*`, Zugriff nur über die `bib_*`-Funktionen). Läuft im selben Supabase-Projekt wie Kinozettel. Kann gefahrlos erneut ausgeführt werden; die Namen werden nur beim ersten Mal eingetragen.
- `?demo` öffnet eine Demo mit Beispieldaten, die nur im eigenen Browser gespeichert wird (`?demo=reset` setzt sie zurück).

## Einrichten

1. Supabase öffnen, links **SQL Editor**, Inhalt von `supabase/setup.sql` einfügen. Ganz unten die Namen anpassen, dann **Run**. Am Ende stehen die persönlichen Links.
2. GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
3. Jeder seinen Link schicken. Auf dem iPhone in Safari öffnen, Teilen → „Zum Home-Bildschirm“.

## Buch erkennen (KI)

Fotos gehen an die Supabase Edge Function `bib-scan` (`supabase/functions/bib-scan/index.ts`), die Claude die Bücher auf dem Bild erkennen lässt, inklusive kurzem Klappentext. Nur gültige persönliche Links dürfen sie aufrufen.

Einrichten im Supabase-Dashboard:
1. **Edge Functions → Secrets**: `ANTHROPIC_API_KEY` mit dem Key von console.anthropic.com anlegen.
2. **Edge Functions → Deploy a new function → Via Editor**: Name `bib-scan`, Inhalt von `index.ts` einfügen, deployen.
3. In den Einstellungen der Funktion **„Verify JWT“ ausschalten** (die Funktion prüft den Link-Token selbst).

Ist die Funktion nicht eingerichtet, liest die App das Cover per Texterkennung im Browser (Tesseract.js). Cover und Zusatzinfos kommen aus Google Books und Open Library, die parallel abgefragt werden. Falls Google Books oft „Quota exceeded“ meldet, in `index.html` bei `GB_KEY` einen kostenlosen API-Key eintragen.
