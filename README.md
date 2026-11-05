# Bibliophile

Buchclub-App für **Die Leseratten**: Bücher fotografieren und sammeln, abstimmen, was als Nächstes gelesen wird, Gelesenes bewerten und Termine fürs nächste Treffen finden. Jede Person öffnet die App über ihren persönlichen Link (`?k=…`) und legt sie auf den Homescreen.

- `index.html`: die App (statisch, GitHub Pages)
- `supabase/setup.sql`: Datenbank (Tabellen `bib_*`, Zugriff nur über die `bib_*`-Funktionen). Läuft im selben Supabase-Projekt wie Kinozettel.
- `?demo` öffnet eine Demo mit Beispieldaten, die nur im eigenen Browser gespeichert wird (`?demo=reset` setzt sie zurück).

## Einrichten

1. Supabase öffnen, links **SQL Editor**, Inhalt von `supabase/setup.sql` einfügen. Ganz unten die Namen anpassen, dann **Run**. Am Ende stehen die persönlichen Links.
2. GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
3. Jeder seinen Link schicken. Auf dem iPhone in Safari öffnen, Teilen → „Zum Home-Bildschirm“.

## Buch erkennen

Das Foto wird im Browser mit Tesseract.js gelesen (nichts geht an einen KI-Dienst). Gesucht wird bei Google Books, als Ausweichlösung bei Open Library. Falls Google Books oft „Quota exceeded“ meldet, in `index.html` bei `GB_KEY` einen kostenlosen API-Key eintragen.
