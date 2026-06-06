import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GROQ_KEY = Deno.env.get("GROQ_API_KEY") || "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";

// Map opus lyric lines to LRCLIB timestamps using Groq.
// Input:
//   opusLines: string[]  (non-blank opus lyric lines, ordered)
//   lrclib: { t: number, text: string }[]  (timestamped LRCLIB lines)
// Output: { timings: number[] } - length === opusLines.length
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { opusLines, lrclib } = await req.json();
    if (!Array.isArray(opusLines) || !Array.isArray(lrclib)) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const opusText = opusLines.map((l: string, i: number) => `${i}: ${l}`).join("\n");
    const lrclibText = lrclib
      .map((x: any, i: number) => `${i} [${Number(x.t).toFixed(2)}s] ${x.text}`)
      .join("\n");

    const prompt = `You will align song lyrics with timestamps.

OPUS LYRICS (target, ordered by index):
${opusText}

LRCLIB LYRICS WITH TIMESTAMPS:
${lrclibText}

For EACH opus line index (0..${opusLines.length - 1}) return the best matching LRCLIB timestamp in seconds. If an opus line has no clear match, interpolate between the surrounding matched timestamps so timings stay strictly increasing.

Return ONLY a JSON object: {"timings":[t0,t1,...]} with exactly ${opusLines.length} numbers, sorted ascending. No prose.`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "You output only valid JSON. No commentary." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch {}
    let timings: number[] = Array.isArray(parsed.timings) ? parsed.timings.map((n: any) => Number(n)).filter((n: any) => Number.isFinite(n)) : [];

    // Validate length; if mismatched, fall back to proportional interpolation.
    if (timings.length !== opusLines.length) {
      const first = lrclib[0]?.t ?? 0;
      const last = lrclib[lrclib.length - 1]?.t ?? first + opusLines.length;
      const step = (last - first) / Math.max(1, opusLines.length - 1);
      timings = opusLines.map((_: any, i: number) => first + step * i);
    }

    // Ensure strictly increasing
    for (let i = 1; i < timings.length; i++) {
      if (timings[i] <= timings[i - 1]) timings[i] = timings[i - 1] + 0.1;
    }

    return new Response(JSON.stringify({ timings }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("sync-lyrics error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message || "Failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
