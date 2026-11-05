// Bibliophile – Buch-Erkennung per Foto mit Claude.
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

const SCHEMA = {
  type: "object",
  properties: {
    books: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          authors: { type: "string" },
          isbn: { type: "string" },
          blurb: { type: "string" },
        },
        required: ["title", "authors", "isbn", "blurb"],
        additionalProperties: false,
      },
    },
  },
  required: ["books"],
  additionalProperties: false,
};

const PROMPT = `Auf diesem Foto sind ein oder mehrere Bücher zu sehen, zum Beispiel in einem Schaufenster, einem Regal oder in der Hand.
Erkenne jedes Buch, dessen Titel du lesen oder sicher erkennen kannst. Das auffälligste Buch zuerst, höchstens fünf.
- title: der Titel, wie er auf dem Cover steht (bei deutschen Ausgaben der deutsche Titel, ohne Zusätze wie "Roman" oder "Spiegel-Bestseller").
- authors: Autorin oder Autor, mehrere mit Komma getrennt.
- isbn: nur wenn sie auf dem Foto lesbar ist, sonst leerer Text.
- blurb: ein kurzer Klappentext auf Deutsch in zwei bis vier Sätzen, worum es geht, ohne Spoiler. Nur wenn du das Buch kennst, sonst leerer Text. Nichts erfinden.
Wenn kein Buch erkennbar ist, gib eine leere Liste zurück.`;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);

  let body: { token?: string; image?: string; mediaType?: string };
  try { body = await req.json(); } catch { return json({ error: "Ungültige Anfrage" }, 400); }
  const { token = "", image = "", mediaType = "image/jpeg" } = body;

  if (!(await validToken(token))) return json({ error: "Ungültiger Link" }, 401);
  if (!image || image.length > 6_000_000) return json({ error: "Foto fehlt oder ist zu groß" }, 400);

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          { type: "text", text: PROMPT },
        ],
      }],
    } as any);

    if (response.stop_reason === "refusal") return json({ books: [] });
    const text = response.content.find((b: { type: string }) => b.type === "text") as { text: string } | undefined;
    if (!text) return json({ books: [] });
    const parsed = JSON.parse(text.text);
    return json({ books: Array.isArray(parsed.books) ? parsed.books.slice(0, 5) : [] });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "API-Key fehlt oder ist falsch" }, 500);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Gerade zu viele Anfragen, gleich nochmal versuchen" }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: `KI-Fehler ${e.status}` }, 502);
    return json({ error: "Erkennung fehlgeschlagen" }, 500);
  }
});
