import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, many, q } from '../db.js';
import { ah, bad, notFound, audit, parse } from '../lib/util.js';
import { requireRole, requireWrite } from '../lib/access.js';
import { getSettings } from '../lib/payroll.js';
import { config } from '../config.js';
import { pdfAvailable } from '../lib/docgen.js';

const r = Router();
const opt = (s) => s.optional().nullable().transform((v) => (v === '' ? null : v));

// ---------------- Utenti ----------------
const USER_COLS = 'id, email, full_name, role, auth_provider, must_change_password, totp_enabled, active, last_login_at, created_at';
const userSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2).max(120),
  role: z.enum(['ADMIN', 'HR', 'VIEWER']),
  auth_provider: z.enum(['LOCAL', 'ENTRA', 'BOTH']).default('BOTH'),
  active: z.boolean().default(true),
});
const tempPassword = () => `Td-${crypto.randomBytes(9).toString('base64url')}1`;

r.get('/users', requireRole('ADMIN'), ah(async (_req, res) => res.json(await many(`SELECT ${USER_COLS} FROM users ORDER BY full_name`))));

r.post('/users', requireRole('ADMIN'), ah(async (req, res) => {
  const d = parse(userSchema, req.body);
  let temp = null; let hash = null;
  if (d.auth_provider !== 'ENTRA') { temp = tempPassword(); hash = await bcrypt.hash(temp, 12); }
  const row = await one(`INSERT INTO users (email, full_name, role, auth_provider, password_hash, must_change_password, active)
    VALUES ($1,$2,$3,$4,$5,TRUE,$6) RETURNING ${USER_COLS}`, [d.email.toLowerCase(), d.full_name, d.role, d.auth_provider, hash, d.active]);
  await audit(req, 'USER_CREATE', 'user', row.id, { email: d.email, role: d.role });
  res.status(201).json({ ...row, temp_password: temp });
}));

r.put('/users/:id', requireRole('ADMIN'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const d = parse(userSchema.partial(), req.body);
  if (id === req.user.id && (d.role && d.role !== 'ADMIN' || d.active === false)) throw bad('Non puoi declassare o disattivare il tuo stesso account');
  const cols = Object.keys(d);
  if (!cols.length) return res.json({ ok: true });
  await q(`UPDATE users SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(', ')}, updated_at=now() WHERE id=$1`, [id, ...cols.map((c) => (c === 'email' ? d[c].toLowerCase() : d[c]))]);
  await audit(req, 'USER_UPDATE', 'user', id, d);
  res.json({ ok: true });
}));

r.post('/users/:id/reset-password', requireRole('ADMIN'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const u = await one('SELECT id, auth_provider FROM users WHERE id=$1', [id]);
  if (!u) throw notFound();
  if (u.auth_provider === 'ENTRA') throw bad('Utente con solo accesso Microsoft 365');
  const temp = tempPassword();
  await q('UPDATE users SET password_hash=$2, must_change_password=TRUE, totp_enabled=FALSE, totp_secret=NULL, failed_logins=0, locked_until=NULL, updated_at=now() WHERE id=$1', [id, await bcrypt.hash(temp, 12)]);
  await audit(req, 'USER_PASSWORD_RESET', 'user', id);
  res.json({ temp_password: temp });
}));

// ---------------- Impostazioni ----------------
const SETTING_KEYS = ['company_name', 'company_address', 'company_legal_address', 'company_vat', 'company_rea', 'company_capital', 'company_phone', 'company_email', 'company_pec', 'company_website', 'health_director', 'signatory_name', 'signatory_title', 'letter_city', 'cost_inps_pct', 'cost_inail_pct', 'cost_tfr_pct', 'cost_apprentice_inps_pct', 'cost_dirigente_extra_pct', 'irpef_brackets', 'employee_inps_pct', 'addizionale_regionale_pct', 'addizionale_comunale_pct', 'function_allowance_share', 'deadline_alert_days', 'board_signatory_name', 'board_signatory_title', 'dirigenti_minimum', 'dirigenti_monthly_payments'];

r.get('/settings', ah(async (_req, res) => {
  const s = await getSettings();
  res.json({ settings: s, entraEnabled: config.entra.enabled, aiEnabled: Boolean(config.anthropicKey), pdfEnabled: await pdfAvailable(), maxUploadMb: config.maxUploadMb });
}));

r.put('/settings', requireRole('ADMIN'), ah(async (req, res) => {
  const body = req.body || {};
  for (const k of Object.keys(body)) {
    if (!SETTING_KEYS.includes(k)) throw bad(`Impostazione sconosciuta: ${k}`);
    await q('INSERT INTO app_settings(key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [k, String(body[k] ?? '')]);
  }
  await audit(req, 'SETTINGS_UPDATE', 'settings', null, body);
  res.json({ ok: true });
}));

// ---------------- Aree e sedi ----------------
r.get('/areas', ah(async (_req, res) => res.json(await many(`SELECT a.*, t.path, t.root_id, t.root_name,
  (SELECT count(*)::int FROM resources r WHERE r.status IN ('ATTIVO','IMPEGNO') AND (r.area_id=a.id OR r.id IN (SELECT resource_id FROM resource_areas WHERE area_id=a.id))) AS headcount,
  (SELECT count(*)::int FROM areas c WHERE c.parent_id=a.id) AS children
  FROM areas a JOIN areas_tree t ON t.id=a.id ORDER BY t.sort_path, a.name`))));
r.post('/areas', requireWrite, ah(async (req, res) => {
  const d = parse(z.object({ name: z.string().min(2).max(120), sort_order: z.number().int().default(100), parent_id: z.number().int().nullable().optional() }), req.body);
  let level = 1;
  if (d.parent_id) { const p = await one('SELECT level FROM areas WHERE id=$1', [d.parent_id]); if (!p) throw bad('Area di livello superiore inesistente'); if (p.level >= 3) throw bad('Sono previsti al massimo tre livelli'); level = p.level + 1; }
  const row = await one('INSERT INTO areas(name, sort_order, parent_id, level) VALUES ($1,$2,$3,$4) RETURNING *', [d.name, d.sort_order, d.parent_id || null, level]);
  await audit(req, 'AREA_CREATE', 'area', row.id, d);
  res.status(201).json(row);
}));
r.delete('/areas/:id', requireRole('ADMIN'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const a = await one('SELECT name FROM areas WHERE id=$1', [id]);
  if (!a) throw notFound();
  const n = (await one('SELECT count(*)::int AS n FROM resources WHERE area_id=$1 OR id IN (SELECT resource_id FROM resource_areas WHERE area_id=$1)', [id])).n;
  if (n > 0) throw bad(`L'area "${a.name}" ha ${n} risors${n === 1 ? 'a' : 'e'} assegnat${n === 1 ? 'a' : 'e'}: spostale in un'altra area prima di eliminarla`);
  const c = (await one('SELECT count(*)::int AS n FROM areas WHERE parent_id=$1', [id])).n;
  if (c > 0) throw bad(`L'area "${a.name}" ha ${c} aree di livello inferiore: eliminale o spostale prima`);
  await q('UPDATE org_units SET area_id=NULL WHERE area_id=$1', [id]);
  await q('DELETE FROM areas WHERE id=$1', [id]);
  await audit(req, 'AREA_DELETE', 'area', id, { name: a.name });
  res.json({ ok: true });
}));
r.put('/areas/:id', requireWrite, ah(async (req, res) => {
  const id = Number(req.params.id);
  const cur = await one('SELECT * FROM areas WHERE id=$1', [id]);
  if (!cur) throw notFound();
  const d = parse(z.object({ name: z.string().trim().min(2).max(120).optional(), sort_order: z.number().int().optional(), active: z.boolean().optional(), parent_id: z.number().int().nullable().optional() }), req.body);
  if (d.parent_id !== undefined) {
    // spostamento nella gerarchia: niente cicli, massimo tre livelli (contando anche i discendenti)
    let newLevel = 1;
    if (d.parent_id !== null) {
      if (d.parent_id === id) throw bad('Un\'area non può dipendere da sé stessa');
      const p = await one('SELECT id, level FROM areas WHERE id=$1', [d.parent_id]);
      if (!p) throw bad('Area di livello superiore inesistente');
      const desc = await many('WITH RECURSIVE t AS (SELECT id FROM areas WHERE parent_id=$1 UNION ALL SELECT a.id FROM areas a JOIN t ON a.parent_id=t.id) SELECT id FROM t', [id]);
      if (desc.some((x) => x.id === d.parent_id)) throw bad('Spostamento non valido: l\'area scelta dipende già da questa');
      newLevel = p.level + 1;
    }
    const depth = (await one('WITH RECURSIVE t AS (SELECT id, 1 AS d FROM areas WHERE id=$1 UNION ALL SELECT a.id, t.d+1 FROM areas a JOIN t ON a.parent_id=t.id) SELECT max(d)::int AS m FROM t', [id])).m;
    if (newLevel + depth - 1 > 3) throw bad('Sono previsti al massimo tre livelli: le aree sotto a questa supererebbero il terzo');
    await q('UPDATE areas SET parent_id=$2, level=$3 WHERE id=$1', [id, d.parent_id, newLevel]);
    await q('WITH RECURSIVE t AS (SELECT id, level FROM areas WHERE id=$1 UNION ALL SELECT a.id, t.level+1 FROM areas a JOIN t ON a.parent_id=t.id) UPDATE areas x SET level=t.level FROM t WHERE x.id=t.id AND x.id<>$1', [id]);
    delete d.parent_id;
  }
  const cols = Object.keys(d);
  if (cols.length) await q(`UPDATE areas SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(', ')} WHERE id=$1`, [id, ...cols.map((c) => d[c])]);
  await audit(req, 'AREA_UPDATE', 'area', id, req.body);
  res.json({ ok: true });
}));
r.get('/work-sites', ah(async (_req, res) => res.json(await many('SELECT * FROM work_sites WHERE active ORDER BY id'))));
r.post('/work-sites', requireWrite, ah(async (req, res) => {
  const d = parse(z.object({ name: z.string().min(2).max(120), address: z.string().min(5).max(250) }), req.body);
  res.status(201).json(await one('INSERT INTO work_sites(name, address) VALUES ($1,$2) RETURNING *', [d.name, d.address]));
}));
r.delete('/work-sites/:id', requireWrite, ah(async (req, res) => { await q('UPDATE work_sites SET active=FALSE WHERE id=$1', [Number(req.params.id)]); res.json({ ok: true }); }));

// ---------------- Registro attività ----------------
r.get('/audit', requireRole('ADMIN'), ah(async (req, res) => {
  const limit = Math.min(500, Number(req.query.limit || 200));
  const rows = await many(`SELECT a.id, a.action, a.entity, a.entity_id, a.data, a.ip, a.at, u.full_name AS user_name
    FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.at DESC LIMIT $1`, [limit]);
  res.json(rows);
}));

export default r;
