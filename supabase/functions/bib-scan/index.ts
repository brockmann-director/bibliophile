// Bibliophile – Bücher per Foto oder Suchtext finden, mit Claude und Websuche.
// Supabase Edge Function "bib-scan". Braucht das Secret ANTHROPIC_API_KEY.
// "Verify JWT" bei dieser Funktion ausschalten: Der Zugriff wird hier über den persönlichen Link-Token geprüft.
import Anthropic from "npm:@anthropic-ai/sdk";

const client = new Anthropic(); // liest ANTHROPIC_API_KEY aus den Secrets

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Über dieses Werkzeug gibt Claude das Ergebnis zurück.
const REPORT_TOOL = {
  name: "report_books",
  description: "Gibt die gefundenen Bücher an die App zurück. Genau einmal am Ende aufrufen.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      books: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Titel der deutschen Ausgabe, falls es eine gibt, ohne Zusätze wie 'Roman'" },
            authors: { type: "string", description: "Autor*innen, mit Komma getrennt" },
            isbn: { type: "string", description: "ISBN-13 der deutschen Ausgabe, nur Ziffern, leer wenn unbekannt" },
            year: { type: "string", description: "Erscheinungsjahr der Ausgabe, leer wenn unbekannt" },
            blurb: { type: "string", description: "Klappentext auf Deutsch, zwei bis vier Sätze, ohne Spoiler" },
          },
          required: ["title", "authors", "isbn", "year", "blurb"],
          additionalProperties: false,
        },
      },
    },
    required: ["books"],
    additionalProperties: false,
  },
};

const WEB_SEARCH = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 4,
  user_location: { type: "approximate", country: "DE", city: "Hamburg", timezone: "Europe/Berlin" },
};

const SYSTEM = `Du hilfst einem kleinen Hamburger Buchclub, Bücher zu erfassen. Viele Bücher sind deutschsprachig und nur mittelbekannt.
Vorgehen:
1. Bestimme, um welche Bücher es geht. Lies Titel und Namen auf Fotos Buchstabe für Buchstabe genau ab, auch kleine Schrift auf Covern und Buchrücken.
2. Prüfe jedes Buch mit der Websuche nach, zum Beispiel bei Verlagen, Buchhandlungen (Thalia, Hugendubel, buecher.de), der Deutschen Nationalbibliothek oder Perlentaucher. Korrigiere Schreibweisen anhand der Fundstellen.
3. Nimm die ISBN-13 der deutschen Ausgabe (bevorzugt die Ausgabe, deren Cover zu sehen ist) und schreibe einen kurzen Klappentext auf Deutsch in eigenen Worten, zwei bis vier Sätze, ohne Spoiler.
4. Gib das Ergebnis mit report_books zurück, das wichtigste oder auffälligste Buch zuerst, höchstens fünf.
Erfinde nichts: Was du nicht sicher weißt, bleibt leer. Wenn kein Buch erkennbar ist, gib eine leere Liste zurück.`;

async function validToken(token: string): Promise<boolean> {
  if (!token || !/^[a-zA-Z0-9]+$/.test(token)) return false;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return false;
  const r = await fetch(`${url}/rest/v1/bib_members?select=id&token=eq.${token}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) return false;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}

type Book = { title: string; authors: string; isbn: string; year: string; blurb: string };

async function findBooks(userContent: unknown[]): Promise<Book[]> {
  const messages: any[] = [{ role: "user", content: userContent }];
  for (let round = 0; round < 5; round++) {
    const response: any = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: SYSTEM,
      tools: [WEB_SEARCH, REPORT_TOOL],
      tool_choice: { type: "auto" },
      messages,
    } as any);

    if (response.stop_reason === "refusal") return [];
    const report = response.content.find((b: any) => b.type === "tool_use" && b.name === "report_books");
    if (report) return Array.isArray(report.input?.books) ? report.input.books.slice(0, 5) : [];

    if (response.stop_reason === "pause_turn") {
      // Websuche läuft noch: Antwort unverändert zurückschicken, der Server macht weiter.
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    // Ohne Werkzeugaufruf beendet: einmal ausdrücklich um das Ergebnis bitten.
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: [{ type: "text", text: "Bitte gib das Ergebnis jetzt mit report_books zurück." }] });
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);

  let body: { token?: string; image?: string; mediaType?: string; query?: string };
  try { body = await req.json(); } catch { return json({ error: "Ungültige Anfrage" }, 400); }
  const { token = "", image = "", mediaType = "image/jpeg", query = "" } = body;

  if (!(await validToken(token))) return json({ error: "Ungültiger Link" }, 401);

  let content: unknown[];
  if (image) {
    if (image.length > 6_000_000) return json({ error: "Foto ist zu groß" }, 400);
    content = [
      { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
      { type: "text", text: "Welche Bücher sind auf diesem Foto? Es kann ein einzelnes Cover sein, ein Schaufenster, ein Regal oder ein Buch in der Hand." },
    ];
  } else if (query.trim()) {
    content = [{ type: "text", text: `Wir suchen ein Buch. Unsere Eingabe (kann ungenau oder falsch geschrieben sein): "${query.trim().slice(0, 300)}". Finde die passenden Bücher.` }];
  } else {
    return json({ error: "Foto oder Suchtext fehlt" }, 400);
  }

  try {
    const books = await findBooks(content);
    return json({ books });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "API-Key fehlt oder ist falsch" }, 500);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Gerade zu viele Anfragen, gleich nochmal versuchen" }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: `KI-Fehler ${e.status}: ${e.message}` }, 502);
    return json({ error: "Erkennung fehlgeschlagen" }, 500);
  }
});
