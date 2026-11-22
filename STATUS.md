# Bibliophile – Stand

Stand: 22.11.2026 · Version 1, in Benutzung

## Was es ist

Web-App für den Buchclub **„Die Leseratten“** (Jan und zwei Nachbarinnen). Sie ersetzt das Durcheinander im WhatsApp-Chat:

- **Stapel**: Bücher, die wir lesen wollen. Man merkt sich Bücher vor (Stimmen), die Liste ist danach sortiert. Oben steht „Gerade auf dem Nachttisch“.
- **Regal**: Gelesene Bücher mit 1 bis 5 Sternen pro Person und Durchschnitt.
- **Treffen**: Terminvorschläge, jede antwortet mit „Passt“, „Vielleicht“ oder „Geht nicht“. Der beste Vorschlag ist als Favorit markiert. Ein festgelegter Termin kann in den Kalender (.ics) übernommen und per WhatsApp geteilt werden.
- **Buch hinzufügen** (Kamera oben rechts): Ein Foto vom Cover, Schaufenster oder Regal. Die KI erkennt die Bücher, prüft sie per Websuche und holt ISBN und Klappentext, das Cover kommt über die ISBN von der DNB. Alternativ geht eine Textsuche (Google Books und Open Library, bei leerem Ergebnis automatisch die KI-Websuche) oder ein Eintrag von Hand.

## Technik

| Teil | Wo | Hinweis |
|---|---|---|
| App | `index.html` (eine Datei, kein Build) | GitHub Pages: https://brockmann-director.github.io/bibliophile/ |
| Datenbank | Supabase, **dasselbe Projekt wie Kinozettel** (`xvhuljefiqvprabpapcb`) | Tabellen und Funktionen `bib_*`, Skript `supabase/setup.sql` (kann erneut laufen, Mitglieder werden nur beim ersten Lauf angelegt) |
| KI-Erkennung | Supabase Edge Function `bib-scan`, Code in `supabase/functions/bib-scan/index.ts` | Claude (`claude-opus-5-5`) mit Websuche. Secret `ANTHROPIC_API_KEY`, „Verify JWT“ aus. |
| Zugang | persönlicher Link `?k=<token>` pro Person | Tokens in `bib_members`. Namen dort im Table Editor ändern, die Links bleiben gleich. |
| Demo | `?demo` | Beispieldaten nur im eigenen Browser, **ohne KI** (Absicht, schützt das Guthaben). `?demo=reset` setzt zurück. |

Design: helles Papier (`#f4eee4`), Bordeaux-Akzent (`#8a2b34`), Fraunces (Serif) und Inter, Tab-Leiste unten. Bewusst anders als Kinozettel.

## Wichtig zu wissen

- **Änderungen an `bib-scan` wirken erst nach Deploy in Supabase.** Ein Push ins Repo reicht nicht: Supabase → Edge Functions → bib-scan → Code → einfügen → Deploy. (Es gibt keinen Supabase-Connector, Jan macht das von Hand.)
- Die Funktion prüft den Link über die RPC `bib_me` mit dem `apikey` aus der Anfrage. Der Service-Role-Key hat in diesem Projekt nicht funktioniert.
- Das `manifest.webmanifest` hat **keine** `start_url`, damit die Homescreen-App den `?k=`-Link behält.
- Kosten: etwa 5 bis 15 Cent pro Foto oder KI-Suche (Anthropic Console, Jans private Org, „Jan's Individual Org“, 5 $ Startguthaben, Key ohne Ablauf).
- Google Books ohne Key läuft oft ins Quota-Limit. Falls nötig, in `index.html` bei `GB_KEY` einen Key eintragen.
- Keine GitHub Actions, Pushes kosten also keine Build-Minuten.

## Mögliche nächste Schritte

- Kommentare oder Diskussion pro Buch
- Erinnerung vor dem festgelegten Treffen
- Günstigeres Modell für die Erkennung, falls das Guthaben zu schnell sinkt
