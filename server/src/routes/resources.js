import { Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { one, many, q, tx } from '../db.js';
import { ah, bad, notFound, audit, parse } from '../lib/util.js';
import { requireWrite, requireRole, Params } from '../lib/access.js';
import { config } from '../config.js';
import { parseDocument, ocrAvailable } from '../lib/contractParse.js';
import { getSettings, decompose, decomposeDirigente, costCoefficient, companyCost, minimumFor, ralAt } from '../lib/payroll.js';
import { computeDeadlines, missingDocuments } from '../lib/deadlines.js';
import { CATEGORY_LABELS } from '../lib/seedData.js';

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });
const opt = (s) => s.optional().nullable().transform((v) => (v === '' ? null : v));
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const optDate = () => opt(z.string().regex(dateRe, 'data non valida (AAAA-MM-GG)'));
const num = () => z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().nullable());

export const personSchema = z.object({
  kind: z.enum(['DIPENDENTE', 'LP']),
  status: z.enum(['CANDIDATO', 'IMPEGNO', 'ATTIVO', 'CESSATO']).optional(),
  last_name: z.string().min(1).max(100),
  first_name: z.string().min(1).max(100),
  sex: opt(z.enum(['F', 'M'])),
  title: opt(z.string().max(20)),
  birth_place: opt(z.string().max(120)),
  birth_date: optDate(),
  tax_code: opt(z.string().max(16).transform((v) => v.toUpperCase().trim())),
  vat_number: opt(z.string().max(16)),
  phone: opt(z.string().max(40)),
  email: opt(z.string().email().or(z.literal(''))),
  address: opt(z.string().max(200)),
  zip: opt(z.string().max(10)),
  city: opt(z.string().max(100)),
  province: opt(z.string().max(4).transform((v) => v.toUpperCase())),
  area_id: num(),
  manager_id: num(),
  approver_id: num(),
  notes: opt(z.string().max(4000)),
  hired_at: optDate(),
  terminated_at: optDate(),
});

export const employmentSchema = z.object({
  contract_type: z.enum(['TIND', 'TDET', 'APPRENDISTATO', 'DIRIGENTE']).default('TIND'),
  ccnl: z.string().max(40).default('STUDI_PROFESSIONALI'),
  level: opt(z.string().max(12)),
  qualification: opt(z.string().max(60)),
  job_title: opt(z.string().max(160)),
  weekly_hours: num().default(40),
  weekly_days: num().default(5),
  days_label: opt(z.string().max(60)),
  autonomous_hours: z.boolean().default(false),
  ral: num().default(0),
  monthly_payments: num().default(14),
  base_pay: num(),
  superminimo: num(),
  superminimo_absorbable: z.boolean().default(true),
  function_allowance: num(),
  start_date: optDate(),
  end_date: optDate(),
  probation: opt(z.string().max(200)),
  probation_days: num(),
  probation_end: optDate(),
  work_site: opt(z.string().max(250)),
  benefits: z.array(z.string().max(200)).default([]),
  smart_working: z.boolean().default(false),
  mbo_enabled: z.boolean().default(false),
  mbo_pct: num().refine((v) => v == null || (v >= 0 && v <= 100), 'La percentuale MBO deve essere tra 0 e 100'),
  mbo_amount: num(),
  mbo_year: num(),
  mbo_objectives: z.array(z.object({ area: z.string().max(120), objective: z.string().max(400), kpi: z.string().max(200), target: z.string().max(100), weight: num() })).default([]),
  mbo_individual: opt(z.string().max(400)),
  ral_steps: z.array(z.object({ from: z.string().regex(dateRe), ral: num() })).default([]),
  cost_coefficient: num(),
  letter_date: optDate(),
  unilav_ref: opt(z.string().max(80)),
  reports_to: opt(z.string().max(300)),
  imported_from: opt(z.string().max(200)),
  notes: opt(z.string().max(4000)),
});

export const lpSchema = z.object({
  discipline: opt(z.string().max(120)),
  role_description: opt(z.string().max(600)),
  activities: z.array(z.string().max(300)).default([]),
  degrees: z.array(z.string().max(300)).default([]),
  order_name: opt(z.string().max(120)),
  order_province: opt(z.string().max(60)),
  order_number: opt(z.string().max(40)),
  order_since: optDate(),
  insurance_required: num(),
  insurance_company: opt(z.string().max(120)),
  insurance_policy: opt(z.string().max(60)),
  insurance_expiry: optDate(),
  start_date: optDate(),
  end_date: optDate(),
  auto_renew: z.boolean().default(true),
  notice_days: num().default(30),
  fees: z.array(z.object({ type: z.enum(['FISSO', 'ORARIO', 'PRESTAZIONE', 'VARIABILE']), code: opt(z.string().max(20)), description: z.string().max(300), category: opt(z.string().max(100)), amount: num(), unit: opt(z.string().max(20)), notes: opt(z.string().max(300)) })).default([]),
  est_monthly_cost: num(),
  vat_regime: opt(z.string().max(60)),
  letter_date: optDate(),
  notes: opt(z.string().max(4000)),
});

const EMP_COLS = Object.keys(employmentSchema.shape);
const LP_COLS = Object.keys(lpSchema.shape);

function lpMonthlyEstimate(lp) {
  if (lp.est_monthly_cost != null) return Number(lp.est_monthly_cost);
  return (lp.fees || []).filter((f) => f.type === 'FISSO').reduce((a, f) => a + Number(f.amount || 0), 0);
}

export async function upsertEmployment(c, id, e) {
  const data = { ...e };
  if (data.contract_type === 'DIRIGENTE') {
    const S = await getSettings();
    data.level = 'DIRIGENTE'; data.ccnl = 'DIRIGENTI_INDUSTRIA'; data.qualification = data.qualification || 'Dirigente';
    if (!data.monthly_payments || data.monthly_payments === 14) data.monthly_payments = Number(S.dirigenti_monthly_payments || 13);
    if (data.ral && !data.base_pay) { const dec = decomposeDirigente(data.ral, S, data.monthly_payments); data.base_pay = dec.base_pay; data.superminimo = dec.superminimo; data.function_allowance = 0; }
    if (!data.probation) data.probation = 'Non richiesto';
  }
  if (data.ral && !data.base_pay && data.level && data.contract_type !== 'DIRIGENTE') {
    const m = await minimumFor(data.level, data.start_date);
    const S = await getSettings();
    const dec = decompose(data.ral, data.monthly_payments || 14, m?.amount ?? null, Number(S.function_allowance_share || 0.7));
    data.base_pay = dec.base_pay; data.superminimo = dec.superminimo; data.function_allowance = dec.function_allowance;
  }
  if (data.probation_days && data.start_date && !data.probation_end) {
    const d = new Date(`${data.start_date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + Number(data.probation_days));
    data.probation_end = d.toISOString().slice(0, 10);
  }
  const cols = EMP_COLS.filter((k) => k in data);
  const vals = cols.map((k) => (['benefits', 'mbo_objectives', 'ral_steps'].includes(k) ? JSON.stringify(data[k]) : data[k]));
  await c.query(`INSERT INTO employments (resource_id, ${cols.join(',')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(',')})
    ON CONFLICT (resource_id) DO UPDATE SET ${cols.map((k) => `${k}=EXCLUDED.${k}`).join(', ')}, updated_at=now()`, [id, ...vals]);
}

export async function upsertLp(c, id, l) {
  const data = { ...l };
  data.est_monthly_cost = lpMonthlyEstimate(data);
  const cols = LP_COLS.filter((k) => k in data);
  const vals = cols.map((k) => (['degrees', 'fees', 'activities'].includes(k) ? JSON.stringify(data[k]) : data[k]));
  await c.query(`INSERT INTO lp_contracts (resource_id, ${cols.join(',')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(',')})
    ON CONFLICT (resource_id) DO UPDATE SET ${cols.map((k) => `${k}=EXCLUDED.${k}`).join(', ')}, updated_at=now()`, [id, ...vals]);
}

// Arricchisce la risorsa con i dati economici (costo azienda, RAL vigente)
async function enrich(rows, S) {
  return rows.map((x) => {
    if (x.kind === 'DIPENDENTE') {
      const coef = costCoefficient(S, x);
      const ral = ralAt(x);
      const mboPct = x.mbo_enabled ? (Number(x.mbo_amount) > 0 && ral ? Number(x.mbo_amount) / ral * 100 : x.mbo_pct) : 0;
      const cost = companyCost(ral, coef, mboPct);
      return { ...x, ral_current: ral, cost_coefficient_used: coef, cost_annual: cost.annual, cost_monthly: cost.monthly, cost_mbo_max: cost.mbo_max };
    }
    if (x.kind === 'LP') {
      const m = x.est_monthly_cost != null ? Number(x.est_monthly_cost) : 0;
      return { ...x, cost_monthly: m, cost_annual: Math.round(m * 12 * 100) / 100 };
    }
    return x;
  });
}

const LIST_SQL = `SELECT r.*, a.name AS area_name, m.last_name || ' ' || m.first_name AS manager_name, ap.last_name || ' ' || ap.first_name AS approver_name,
    e.contract_type, e.level, e.job_title, e.ral, e.ral_steps, e.monthly_payments, e.weekly_hours, e.start_date AS emp_start, e.probation_end, e.mbo_enabled, e.mbo_pct, e.mbo_amount, e.cost_coefficient, e.end_date AS emp_end,
    l.discipline, l.start_date AS lp_start, l.end_date AS lp_end, l.est_monthly_cost, l.insurance_expiry,
    (SELECT count(*)::int FROM attachments t WHERE t.resource_id=r.id) AS attachments_count,
    (SELECT count(*)::int FROM generated_documents g WHERE g.resource_id=r.id) AS documents_count
  FROM resources r
  LEFT JOIN areas a ON a.id=r.area_id
  LEFT JOIN resources m ON m.id=r.manager_id
  LEFT JOIN resources ap ON ap.id=r.approver_id
  LEFT JOIN employments e ON e.resource_id=r.id
  LEFT JOIN lp_contracts l ON l.resource_id=r.id`;

r.get('/', ah(async (req, res) => {
  const P = new Params();
  const w = ['TRUE'];
  if (req.query.kind) w.push(`r.kind = ${P.add(req.query.kind)}`);
  if (req.query.status) w.push(`r.status = ANY(string_to_array(${P.add(req.query.status)}, ','))`);
  else w.push(`r.status <> 'CANDIDATO'`);
  if (req.query.area_id) w.push(`r.area_id = ${P.add(Number(req.query.area_id))}`);
  if (req.query.sex) w.push(`r.sex = ${P.add(req.query.sex)}`);
  if (req.query.q) w.push(`(r.last_name || ' ' || r.first_name || ' ' || coalesce(r.first_name,'') || ' ' || coalesce(r.tax_code,'') || ' ' || coalesce(e.job_title,'') || ' ' || coalesce(l.discipline,'')) ILIKE ${P.add(`%${req.query.q}%`)}`);
  const rows = await many(`${LIST_SQL} WHERE ${w.join(' AND ')} ORDER BY r.last_name, r.first_name`, P.values);
  const S = await getSettings();
  const out = await enrich(rows, S);
  if (req.user.role === 'VIEWER') for (const x of out) { delete x.ral; delete x.ral_current; delete x.cost_annual; delete x.cost_monthly; delete x.cost_mbo_max; delete x.est_monthly_cost; }
  res.json(out);
}));

r.get('/:id', ah(async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await many(`${LIST_SQL} WHERE r.id=$1`, [id]);
  if (!row) throw notFound('Risorsa non trovata');
  const S = await getSettings();
  const [res_] = await enrich([row], S);
  const employment = await one('SELECT * FROM employments WHERE resource_id=$1', [id]);
  const lp = await one('SELECT * FROM lp_contracts WHERE resource_id=$1', [id]);
  const letters = await many('SELECT * FROM commitment_letters WHERE resource_id=$1 ORDER BY created_at DESC', [id]);
  const documents = await many('SELECT g.id, g.kind, g.ref_id, g.version, g.title, g.generated_at, (g.pdf IS NOT NULL) AS has_pdf, coalesce(g.data->\'_missing\', \'[]\'::jsonb) AS missing, u.full_name AS generated_by_name FROM generated_documents g LEFT JOIN users u ON u.id=g.generated_by WHERE g.resource_id=$1 ORDER BY g.generated_at DESC', [id]);
  const attachments = await many('SELECT a.id, a.category, a.filename, a.mime, a.size, a.issued_at, a.expires_at, a.signed, a.notes, a.uploaded_at, u.full_name AS uploaded_by_name FROM attachments a LEFT JOIN users u ON u.id=a.uploaded_by WHERE a.resource_id=$1 ORDER BY a.category, a.uploaded_at DESC', [id]);
  const deadlines = await computeDeadlines({ resourceId: id });
  const checklist = await missingDocuments(id, row.kind);
  let payroll = null;
  if (employment && req.user.role !== 'VIEWER') {
    const m = await minimumFor(employment.level, employment.start_date);
    payroll = { minimum: m, decomposition: decompose(employment.ral, employment.monthly_payments, employment.base_pay ?? m?.amount ?? null, Number(S.function_allowance_share || 0.7)) };
  }
  if (req.user.role === 'VIEWER' && employment) { for (const k of ['ral', 'base_pay', 'superminimo', 'function_allowance', 'ral_steps', 'mbo_pct']) delete employment[k]; }
  const org_units = await many(`SELECT u.id, u.name, u.role_title, u.kind FROM org_units u WHERE u.resource_id=$1 OR (u.resource_id IS NULL AND lower(coalesce(u.head_name,''))=lower($2)) ORDER BY u.sort_order`, [id, `${row.first_name} ${row.last_name}`]);
  res.json({ resource: res_, employment, lp, letters, documents, attachments, deadlines, checklist, payroll, org_units, category_labels: CATEGORY_LABELS });
}));

// Lettura di un contratto/MBO/UNILAV già esistente: restituisce i dati per precompilare il percorso di inserimento
r.post('/parse-document', requireWrite, upload.single('file'), ah(async (req, res) => {
  if (!req.file) throw bad('File mancante');
  const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const out = await parseDocument(req.file.buffer, req.file.mimetype, filename);
  await audit(req, 'DOCUMENT_PARSE', 'resource', null, { filename, detected: out.detected, method: out.method });
  res.json({ ...out, filename, ocr_available: await ocrAvailable() });
}));

r.post('/', requireWrite, ah(async (req, res) => {
  const person = parse(personSchema, req.body.person || {});
  const employment = person.kind === 'DIPENDENTE' && req.body.employment ? parse(employmentSchema, req.body.employment) : null;
  const lp = person.kind === 'LP' && req.body.lp ? parse(lpSchema, req.body.lp) : null;
  const id = await tx(async (c) => {
    const cols = Object.keys(person);
    const row = (await c.query(`INSERT INTO resources (${cols.join(',')}, created_by) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}, $${cols.length + 1}) RETURNING id`, [...cols.map((k) => person[k]), req.user.id])).rows[0];
    if (employment) { await upsertEmployment(c, row.id, employment); if (employment.start_date && !person.hired_at) await c.query('UPDATE resources SET hired_at=$2 WHERE id=$1', [row.id, employment.start_date]); }
    if (lp) { await upsertLp(c, row.id, lp); if (lp.start_date && !person.hired_at) await c.query('UPDATE resources SET hired_at=$2 WHERE id=$1', [row.id, lp.start_date]); }
    return row.id;
  });
  await audit(req, 'RESOURCE_CREATE', 'resource', id, { kind: person.kind, name: `${person.last_name} ${person.first_name}` });
  res.status(201).json({ id });
}));

r.put('/:id', requireWrite, ah(async (req, res) => {
  const id = Number(req.params.id);
  const d = parse(personSchema.partial(), req.body);
  const cols = Object.keys(d);
  if (cols.length) await q(`UPDATE resources SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(', ')}, updated_at=now() WHERE id=$1`, [id, ...cols.map((c) => d[c])]);
  await audit(req, 'RESOURCE_UPDATE', 'resource', id, d);
  res.json({ ok: true });
}));

r.put('/:id/employment', requireWrite, ah(async (req, res) => {
  const id = Number(req.params.id);
  const rsrc = await one('SELECT kind FROM resources WHERE id=$1', [id]);
  if (!rsrc) throw notFound();
  if (rsrc.kind !== 'DIPENDENTE') throw bad('La risorsa non è un dipendente');
  // aggiornamento parziale: i campi non inviati restano quelli salvati (i default dello schema non li sovrascrivono)
  const cur = await one('SELECT * FROM employments WHERE resource_id=$1', [id]);
  const base = {}; if (cur) for (const k of EMP_COLS) if (cur[k] !== null && cur[k] !== undefined) base[k] = typeof cur[k] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cur[k]) ? cur[k] : cur[k];
  const e = parse(employmentSchema, { ...base, ...req.body });
  if (req.body.base_pay === undefined && (req.body.ral !== undefined || req.body.level !== undefined)) { delete e.base_pay; delete e.superminimo; delete e.function_allowance; } // RAL o livello cambiati: ricalcolo
  await tx((c) => upsertEmployment(c, id, e));
  if (e.start_date) await q('UPDATE resources SET hired_at=$2, updated_at=now() WHERE id=$1', [id, e.start_date]);
  await audit(req, 'EMPLOYMENT_UPDATE', 'resource', id, { ral: e.ral, level: e.level, job_title: e.job_title });
  res.json({ ok: true });
}));

r.put('/:id/lp', requireWrite, ah(async (req, res) => {
  const id = Number(req.params.id);
  const rsrc = await one('SELECT kind FROM resources WHERE id=$1', [id]);
  if (!rsrc) throw notFound();
  if (rsrc.kind !== 'LP') throw bad('La risorsa non è un libero professionista');
  const l = parse(lpSchema, req.body);
  await tx((c) => upsertLp(c, id, l));
  if (l.start_date) await q('UPDATE resources SET hired_at=$2, updated_at=now() WHERE id=$1', [id, l.start_date]);
  await audit(req, 'LP_UPDATE', 'resource', id, { discipline: l.discipline, start_date: l.start_date });
  res.json({ ok: true });
}));

r.delete('/:id', requireRole('ADMIN'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 3) throw bad('Indicare la motivazione');
  const rsrc = await one('SELECT last_name, first_name FROM resources WHERE id=$1', [id]);
  if (!rsrc) throw notFound();
  await q('UPDATE resources SET manager_id=NULL WHERE manager_id=$1', [id]);
  await q('UPDATE resources SET approver_id=NULL WHERE approver_id=$1', [id]);
  await q('DELETE FROM resources WHERE id=$1', [id]);
  await audit(req, 'RESOURCE_DELETE', 'resource', id, { name: `${rsrc.last_name} ${rsrc.first_name}`, reason });
  res.json({ ok: true });
}));

// ---------------- Dossier: allegati ----------------
r.post('/:id/attachments', requireWrite, upload.single('file'), ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!await one('SELECT 1 FROM resources WHERE id=$1', [id])) throw notFound();
  if (!req.file) throw bad('File mancante');
  const d = parse(z.object({ category: z.string().min(2).max(40), issued_at: optDate(), expires_at: optDate(), signed: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false), notes: opt(z.string().max(500)), set_cv: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false) }), req.body);
  const sha = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const row = await one(`INSERT INTO attachments (resource_id, category, filename, mime, size, data, sha256, issued_at, expires_at, signed, notes, uploaded_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [id, d.category, filename, req.file.mimetype, req.file.size, req.file.buffer, sha, d.issued_at, d.expires_at, d.signed, d.notes, req.user.id]);
  if (d.set_cv || d.category === 'CV') await q('UPDATE resources SET cv_attachment_id=$2 WHERE id=$1', [id, row.id]);
  await audit(req, 'ATTACHMENT_UPLOAD', 'attachment', row.id, { resource_id: id, category: d.category, filename });
  res.status(201).json({ id: row.id });
}));

r.put('/:id/attachments/:aid', requireWrite, ah(async (req, res) => {
  const d = parse(z.object({ category: z.string().min(2).max(40).optional(), issued_at: optDate(), expires_at: optDate(), signed: z.boolean().optional(), notes: opt(z.string().max(500)) }), req.body);
  const cols = Object.keys(d);
  if (cols.length) await q(`UPDATE attachments SET ${cols.map((c, i) => `${c}=$${i + 3}`).join(', ')} WHERE id=$1 AND resource_id=$2`, [Number(req.params.aid), Number(req.params.id), ...cols.map((c) => d[c])]);
  res.json({ ok: true });
}));

r.get('/:id/attachments/:aid/download', ah(async (req, res) => {
  const a = await one('SELECT filename, mime, data FROM attachments WHERE id=$1 AND resource_id=$2', [Number(req.params.aid), Number(req.params.id)]);
  if (!a) throw notFound();
  const inline = req.query.inline === '1' && ['application/pdf', 'image/png', 'image/jpeg'].includes(a.mime);
  res.set('Content-Type', a.mime).set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.filename)}`).send(a.data);
}));

r.delete('/:id/attachments/:aid', requireWrite, ah(async (req, res) => {
  const a = await one('DELETE FROM attachments WHERE id=$1 AND resource_id=$2 RETURNING filename', [Number(req.params.aid), Number(req.params.id)]);
  if (!a) throw notFound();
  await audit(req, 'ATTACHMENT_DELETE', 'attachment', req.params.aid, { resource_id: Number(req.params.id), filename: a.filename });
  res.json({ ok: true });
}));

// ---------------- Scadenze manuali ----------------
r.post('/:id/deadlines', requireWrite, ah(async (req, res) => {
  const d = parse(z.object({ title: z.string().min(2).max(200), due_date: z.string().regex(dateRe), notes: opt(z.string().max(500)) }), req.body);
  const row = await one('INSERT INTO deadlines (resource_id, title, due_date, notes, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [Number(req.params.id), d.title, d.due_date, d.notes, req.user.id]);
  res.status(201).json(row);
}));
r.put('/:id/deadlines/:did', requireWrite, ah(async (req, res) => {
  const d = parse(z.object({ done: z.boolean().optional(), title: z.string().min(2).max(200).optional(), due_date: z.string().regex(dateRe).optional(), notes: opt(z.string().max(500)) }), req.body);
  const cols = Object.keys(d);
  if (cols.length) await q(`UPDATE deadlines SET ${cols.map((c, i) => `${c}=$${i + 3}`).join(', ')} WHERE id=$1 AND resource_id=$2`, [Number(req.params.did), Number(req.params.id), ...cols.map((c) => d[c])]);
  res.json({ ok: true });
}));
r.delete('/:id/deadlines/:did', requireWrite, ah(async (req, res) => { await q('DELETE FROM deadlines WHERE id=$1 AND resource_id=$2', [Number(req.params.did), Number(req.params.id)]); res.json({ ok: true }); }));

export default r;
