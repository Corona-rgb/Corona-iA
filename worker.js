// Servidor intermedio de CRN.IA (Cloudflare Worker). Guarda tu clave de Gemini en secreto.
// La página web le manda el mensaje, este código le añade la clave y reenvía la respuesta.
// Webs que pueden usar este servidor (solo el dominio, sin barra final ni nombre del repositorio)
const ALLOWED_ORIGINS = ["https://corona-rgb.github.io", "https://aitormatagarcia39-web.github.io"];
const MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST" || !allowed)
      return new Response("Forbidden", { status: 403, headers: cors });
    if (Number(request.headers.get("Content-Length") || 0) > 25 * 1024 * 1024)
      return new Response("Too large", { status: 413, headers: cors });
    let body;
    try { body = await request.json(); } catch { return new Response("Bad request", { status: 400, headers: cors }); }
    if (!MODELS.includes(body.model)) return new Response("Model not allowed", { status: 400, headers: cors });
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${body.model}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY },
        body: JSON.stringify({ contents: body.contents, systemInstruction: body.systemInstruction }),
      });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": upstream.headers.get("Content-Type") || "text/event-stream" },
    });
  },
};
