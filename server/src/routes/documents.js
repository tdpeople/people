import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { one, many, q } from '../db.js';
import { ah, bad, notFound, audit, parse } from '../lib/util.js';
import { requireWrite, requireRole } from '../lib/access.js';
import { renderDocx, docxToPdf, pdfAvailable } from '../lib/docgen.js';
import { contractData, mboData, commitmentData, lpData, fullName } from '../lib/docdata.js';
import { getSettings } from '../lib/payroll.js';

const r = Router();
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const TITLES = {
  CONTRATTO: (r_) => `${r_.last_name} - Lettera di assunzione`,
  MBO: (r_) => `MBO - ${fullName(r_)}`,
  LETTERA_IMPEGNO: (r_) => `Lettera di Impegno - ${fullName(r_)}`,
  CONTRATTO_LP: (r_) => `Contratto LP - ${fullName(r_)}`,
};

export async function generateDocument({ req, resourceId, kind, refId = null, letterDate = null }) {
  const resource = await one('SELECT * FROM resources WHERE id=$1', [resourceId]);
  if (!resource) throw notFound('Risorsa non trovata');
  const S = await getSettings();
  let data;
  if (kind === 'CONTRATTO' || kind === 'MBO') {
    const employment = await one('SELECT * FROM employments WHERE resource_id=$1', [resourceId]);
    if (!employment) throw bad('Dati del rapporto di lavoro mancanti');
    if (kind === 'MBO' && !employment.mbo_enabled) throw bad('MBO non previsto per questa risorsa');
    if (employment.contract_type === 'DIRIGENTE' && kind === 'CONTRATTO') throw bad('Per i dirigenti si usa il format CCNL Dirigenti: caricare il contratto nel dossier');
    data = kind === 'CONTRATTO' ? contractData({ resource, employment, settings: S, letterDate }) : mboData({ resource, employment, settings: S, letterDate });
  } else if (kind === 'CONTRATTO_LP') {
    const lp = await one('SELECT * FROM lp_contracts WHERE resource_id=$1', [resourceId]);
    if (!lp) throw bad('Dati dell\'incarico mancanti');
    data = lpData({ resource, lp, settings: S, letterDate });
  } else if (kind === 'LETTERA_IMPEGNO') {
    const letter = await one('SELECT * FROM commitment_letters WHERE id=$1 AND resource_id=$2', [refId, resourceId]);
    if (!letter) throw notFound('Lettera di impegno non trovata');
    data = commitmentData({ resource, letter, settings: S });
  } else throw bad('Tipo documento non valido');
  const docx = renderDocx(kind, data);
  let pdf = null;
  if (await pdfAvailable()) {
    try { pdf = await docxToPdf(docx); } catch (e) { console.error('[pdf]', e.message); }
  }
  const ver = (await one('SELECT coalesce(max(version),0)+1 AS v FROM generated_documents WHERE resource_id=$1 AND kind=$2 AND coalesce(ref_id,0)=coalesce($3,0)', [resourceId, kind, refId])).v;
  const row = await one(`INSERT INTO generated_documents (resource_id, kind, ref_id, version, title, docx, pdf, data, generated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, version`, [resourceId, kind, refId, ver, TITLES[kind](resource), docx, pdf, JSON.stringify(data), req.user.id]);
  await audit(req, 'DOCUMENT_GENERATE', 'document', row.id, { resource_id: resourceId, kind, version: ver });
  return { id: row.id, version: ver, has_pdf: Boolean(pdf) };
}

r.post('/resources/:id/documents/generate', requireWrite, ah(async (req, res) => {
  const d = parse(z.object({ kind: z.enum(['CONTRATTO', 'MBO', 'CONTRATTO_LP']), letter_date: z.string().regex(dateRe).optional().nullable() }), req.body);
  res.status(201).json(await generateDocument({ req, resourceId: Number(req.params.id), kind: d.kind, letterDate: d.letter_date || null }));
}));

r.get('/documents/:id/download', ah(async (req, res) => {
  const fmt = req.query.format === 'pdf' ? 'pdf' : 'docx';
  const d = await one('SELECT title, version, docx, pdf FROM generated_documents WHERE id=$1', [Number(req.params.id)]);
  if (!d) throw notFound();
  const buf = fmt === 'pdf' ? d.pdf : d.docx;
  if (!buf) throw notFound('PDF non disponibile per questo documento');
  const name = `${d.title} v${d.version}.${fmt}`;
  const inline = req.query.inline === '1' && fmt === 'pdf';
  res.set('Content-Type', fmt === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    .set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`).send(buf);
}));

r.get('/documents/:id', ah(async (req, res) => {
  const d = await one('SELECT id, resource_id, kind, ref_id, version, title, data, generated_at, (pdf IS NOT NULL) AS has_pdf FROM generated_documents WHERE id=$1', [Number(req.params.id)]);
  if (!d) throw notFound();
  res.json(d);
}));

// Archivia il documento generato nel dossier (PDF se disponibile, altrimenti DOCX)
r.post('/documents/:id/archive', requireWrite, ah(async (req, res) => {
  const d = parse(z.object({ category: z.string().min(2).max(40).default('CONTRATTO_FIRMATO'), signed: z.boolean().default(false), expires_at: z.string().regex(dateRe).optional().nullable() }), req.body);
  const doc = await one('SELECT * FROM generated_documents WHERE id=$1', [Number(req.params.id)]);
  if (!doc) throw notFound();
  const buf = doc.pdf || doc.docx;
  const ext = doc.pdf ? 'pdf' : 'docx';
  const mime = doc.pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const row = await one(`INSERT INTO attachments (resource_id, category, filename, mime, size, data, sha256, expires_at, signed, notes, uploaded_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [doc.resource_id, d.category, `${doc.title} v${doc.version}.${ext}`, mime, buf.length, buf, sha, d.expires_at || null, d.signed, `Generato dall'applicazione (documento #${doc.id})`, req.user.id]);
  await audit(req, 'DOCUMENT_ARCHIVE', 'attachment', row.id, { document_id: doc.id });
  res.status(201).json({ id: row.id });
}));

r.delete('/documents/:id', requireRole('ADMIN'), ah(async (req, res) => {
  const d = await one('DELETE FROM generated_documents WHERE id=$1 RETURNING resource_id, title', [Number(req.params.id)]);
  if (!d) throw notFound();
  await audit(req, 'DOCUMENT_DELETE', 'document', req.params.id, d);
  res.json({ ok: true });
}));

r.get('/documents', ah(async (req, res) => {
  const rows = await many(`SELECT g.id, g.resource_id, g.kind, g.version, g.title, g.generated_at, (g.pdf IS NOT NULL) AS has_pdf, r.last_name, r.first_name, r.kind AS resource_kind
    FROM generated_documents g JOIN resources r ON r.id=g.resource_id ORDER BY g.generated_at DESC LIMIT 300`);
  res.json(rows);
}));

export default r;
