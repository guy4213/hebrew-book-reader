// Try to fetch the full text of a Hebrew book by title/author.
// Strategy:
//   1) Search Project Ben-Yehuda (public domain Hebrew literature) — https://benyehuda.org
//   2) If not found, ask Gemini whether the text exists in the public domain and to return it.
//      (Gemini will refuse for copyrighted books — we surface that to the user.)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function searchBenYehuda(title: string, author?: string): Promise<{ text: string; source: string; url: string } | null> {
  try {
    const q = encodeURIComponent([title, author].filter(Boolean).join(" "));
    const searchRes = await fetch(`https://benyehuda.org/api/v1/search?key=${q}`, {
      headers: { "Accept": "application/json" },
    });
    if (!searchRes.ok) return null;
    const results = await searchRes.json();
    const first = Array.isArray(results) ? results[0] : results?.results?.[0];
    if (!first?.id) return null;

    const textRes = await fetch(`https://benyehuda.org/api/v1/texts/${first.id}?file_format=txt`, {
      headers: { "Accept": "application/json" },
    });
    if (!textRes.ok) return null;
    const meta = await textRes.json();
    const downloadUrl: string | undefined = meta?.download_url || meta?.snippet;
    if (downloadUrl?.startsWith("http")) {
      const fileRes = await fetch(downloadUrl);
      if (fileRes.ok) {
        const text = await fileRes.text();
        if (text && text.length > 500) {
          return { text, source: "פרויקט בן-יהודה", url: `https://benyehuda.org/read/${first.id}` };
        }
      }
    }
    if (meta?.snippet && meta.snippet.length > 500) {
      return { text: meta.snippet, source: "פרויקט בן-יהודה (קטע)", url: `https://benyehuda.org/read/${first.id}` };
    }
  } catch (_e) {
    return null;
  }
  return null;
}

async function askGeminiForPublicDomain(title: string, author: string | undefined, apiKey: string): Promise<{ text: string; source: string } | { error: string }> {
  const prompt = `אתה עוזר ספרייתי. המשתמש מבקש את הטקסט המלא של הספר "${title}"${author ? " מאת " + author : ""}.
החזר JSON בלבד באחד מהפורמטים הבאים:

אם הספר הוא בנחלת הכלל (public domain) ואתה יודע את הטקסט שלו במדויק, החזר:
{"status":"ok","text":"<הטקסט המלא של הספר בעברית, ללא קיצורים>","source":"<מקור הטקסט>"}

אם הספר מוגן בזכויות יוצרים, או שאינך יודע את הטקסט המדויק, החזר:
{"status":"unavailable","reason":"<הסבר קצר בעברית למשתמש>"}

אל תמציא טקסט. אל תכתוב סיכום או תקציר במקום הטקסט המלא.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) return { error: `AI gateway error: ${await response.text()}` };
  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.status === "ok" && parsed.text && parsed.text.length > 500) {
      return { text: parsed.text, source: parsed.source || "מודל שפה" };
    }
    return { error: parsed.reason || "הספר אינו זמין אוטומטית." };
  } catch {
    return { error: "לא הצלחנו לפענח את תשובת המודל." };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { title, author } = await req.json();
    if (!title) {
      return new Response(JSON.stringify({ error: "title required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Ben-Yehuda
    const by = await searchBenYehuda(title, author);
    if (by) {
      return new Response(JSON.stringify({ status: "ok", text: by.text, source: by.source, url: by.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Gemini (public domain only)
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const ai = await askGeminiForPublicDomain(title, author, LOVABLE_API_KEY);
    if ("text" in ai) {
      return new Response(JSON.stringify({ status: "ok", text: ai.text, source: ai.source }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ status: "unavailable", reason: ai.error }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
