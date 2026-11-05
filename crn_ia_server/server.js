// Servidor-puente de CRN.IA (versión web gratuita)
// Guarda TU clave de Gemini aquí, en el servidor, para que quien visite la web no tenga que
// pegar la suya. Pone límites por IP y un límite global por día, para que nadie pueda vaciar
// tu cuota aunque borre el contador que la web guarda en su navegador (ese es fácil de saltarse).
//
// Uso (PowerShell):
//   $env:GOOGLE_API_KEY="tu_clave_de_aistudio.google.com"; node server.js

const express = require('express');
const cors = require('cors');

const PORT = process.env.PORT || 3000;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const MODELS = (process.env.MODELS || 'gemini-3.5-flash-lite,gemini-3.1-flash-lite').split(',');
// Límites de seguridad: evitan que un visitante agote tu cuota de Gemini, aunque manipule la web.
const PER_IP_DAILY_LIMIT = Number(process.env.PER_IP_DAILY_LIMIT || 80);   // algo por encima de los 60 que ve la web
const GLOBAL_DAILY_LIMIT = Number(process.env.GLOBAL_DAILY_LIMIT || 2000); // tope de toda la web junta
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'; // pon aquí tu dominio cuando lo tengas, para más seguridad

if (!GOOGLE_API_KEY) {
  console.error('Falta la variable GOOGLE_API_KEY. Consigue una gratis en https://aistudio.google.com/apikey');
  console.error('Luego: $env:GOOGLE_API_KEY="tu_clave"; node server.js');
  process.exit(1);
}

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: '25mb' }));

// ---------- Contadores en memoria (se reinician si reinicias el servidor; suficiente para empezar) ----------
const today = () => new Date().toISOString().slice(0, 10);
let globalDay = today();
let globalCount = 0;
const perIp = new Map(); // ip -> { day, count }

function checkAndCount(ip) {
  const day = today();
  if (day !== globalDay) { globalDay = day; globalCount = 0; perIp.clear(); }
  if (globalCount >= GLOBAL_DAILY_LIMIT) return { ok: false, reason: 'global' };
  const rec = perIp.get(ip) || { day, count: 0 };
  if (rec.day !== day) { rec.day = day; rec.count = 0; }
  if (rec.count >= PER_IP_DAILY_LIMIT) return { ok: false, reason: 'ip' };
  rec.count += 1;
  perIp.set(ip, rec);
  globalCount += 1;
  return { ok: true };
}

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'crn-ia-server', global_used: globalCount }));

// ---------- Chat: reenvía a Gemini y devuelve el texto en crudo, tal como llega ----------
app.post('/api/chat', async (req, res) => {
  const { ok, reason } = checkAndCount(req.ip);
  if (!ok) {
    res.status(429).type('text/plain');
    return res.end(reason === 'global'
      ? 'El servidor ha llegado a su límite de uso de hoy entre todos los visitantes.'
      : 'Has llegado al límite de uso desde esta conexión por hoy.');
  }

  const { history, text, parts } = req.body || {};
  if ((!text || typeof text !== 'string') && !Array.isArray(parts)) {
    return res.status(400).json({ error: 'falta "text" o "parts"' });
  }
  const userParts = Array.isArray(parts) && parts.length ? parts : [{ text: text || '' }];
  const contents = Array.isArray(history)
    ? history.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: String(m.text || '') }] }))
    : [];
  contents.push({ role: 'user', parts: userParts });

  const system = 'Eres CRN.IA, un asistente de IA con tono cercano, directo y sin relleno. '
    + 'Responde en el idioma del usuario. Si no sabes algo, dilo en lugar de inventarlo. Hoy es ' + today() + '.';

  res.type('text/plain; charset=utf-8');
  let wroteAny = false;

  for (const model of MODELS) {
    const isLast = model === MODELS[MODELS.length - 1];
    try {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GOOGLE_API_KEY },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents }),
        }
      );
      if (!upstream.ok) {
        const errText = await upstream.text();
        const retryable = [400, 404, 429, 503].includes(upstream.status) && !/API key/i.test(errText);
        if (!isLast && retryable) continue;
        if (!wroteAny) res.status(502);
        return res.end(wroteAny ? '' : `No se pudo generar respuesta (${upstream.status}).`);
      }
      const reader = upstream.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          try {
            const j = JSON.parse(line.slice(5));
            const t = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [])
              .map(p => p.text || '').join('');
            if (t) { res.write(t); wroteAny = true; }
          } catch (e) { /* línea parcial o de keep-alive: se ignora */ }
        }
      }
      return res.end();
    } catch (e) {
      if (isLast) {
        if (!wroteAny) res.status(502);
        return res.end(wroteAny ? '' : 'No se pudo contactar con Gemini: ' + e.message);
      }
      // si falló un modelo y hay otro en la lista, se prueba el siguiente
    }
  }
  if (!wroteAny) { res.status(502); res.end('No se pudo generar una respuesta.'); }
});

app.listen(PORT, () => console.log(`CRN.IA server escuchando en el puerto ${PORT} (límite/IP: ${PER_IP_DAILY_LIMIT}, límite global: ${GLOBAL_DAILY_LIMIT})`));
