import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { downloadUrl, cacheKey } = await req.json();
    if (!downloadUrl || !cacheKey) {
      return new Response(JSON.stringify({ error: "Missing params" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check if already cached
    const { data: files } = await supabase.storage.from("mp3-cache").list("", { limit: 1, search: cacheKey });
    if (files && files.length > 0 && files.some(f => f.name === cacheKey)) {
      const { data: publicUrl } = supabase.storage.from("mp3-cache").getPublicUrl(cacheKey);
      return new Response(JSON.stringify({ cachedUrl: publicUrl.publicUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download MP3
    const mp3Res = await fetch(downloadUrl);
    if (!mp3Res.ok) throw new Error("Failed to download MP3");
    const mp3Buffer = await mp3Res.arrayBuffer();

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("mp3-cache")
      .upload(cacheKey, mp3Buffer, { contentType: "audio/mpeg", upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(JSON.stringify({ cachedUrl: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: publicUrl } = supabase.storage.from("mp3-cache").getPublicUrl(cacheKey);
    return new Response(JSON.stringify({ cachedUrl: publicUrl.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Cache MP3 error:", error);
    return new Response(JSON.stringify({ cachedUrl: null }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
