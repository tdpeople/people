// Lettura CV: estrazione testo (PDF) e sintesi del profilo (API Claude, facoltativa)
import { createRequire } from 'node:module';
import { config } from '../config.js';

const require = createRequire(import.meta.url);

export async function extractText(buffer, mime) {
  try {
    if (mime === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const out = await pdfParse(buffer, { max: 8 });
      return (out.text || '').replace(/\s+\n/g, '\n').trim().slice(0, 20000);
    }
    if (mime === 'text/plain') return buffer.toString('utf8').slice(0, 20000);
  } catch (e) {
    console.error('[cv] estrazione testo fallita:', e.message);
  }
  return '';
}

// Estrazione euristica di email e telefono dal testo
export function quickFacts(text) {
  const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0] || null;
  const phone = (text.match(/(\+39\s?)?(3\d{2}[\s.-]?\d{3}[\s.-]?\d{3,4}|0\d{1,3}[\s.-]?\d{5,8})/) || [])[0] || null;
  return { email, phone: phone ? phone.replace(/\s/g, ' ').trim() : null };
}

export async function summarizeCv(text, areas) {
  if (!config.anthropicKey || !text) return null;
  const prompt = `Sei l'assistente HR di Toscana Diagnostica (rete sanitaria: laboratorio di analisi, diagnostica per immagini, medicina specialistica, medicina del lavoro). Analizza il CV seguente e rispondi SOLO con un oggetto JSON con le chiavi: first_name, last_name, email, phone, role_target (ruolo per cui è più adatto, in italiano, breve), area (una tra: ${areas.join(' | ')}), summary (sintesi del profilo in 4-6 frasi, italiano, tono professionale: formazione, esperienze, competenze chiave, punti di attenzione), rating (1-5, attinenza al settore sanitario-diagnostico). Usa null per i dati non presenti.\n\nCV:\n${text.slice(0, 12000)}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: config.anthropicModel, max_tokens: 900, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`API Claude: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const txt = (data.content || []).map((c) => c.text || '').join('');
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
