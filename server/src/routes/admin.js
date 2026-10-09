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
const SETTING_KEYS = ['company_name', 'company_address', 'company_legal_address', 'company_vat', 'company_rea', 'company_capital', 'company_phone', 'company_email', 'company_pec', 'company_website', 'health_director', 'signatory_name', 'signatory_title', 'letter_city', 'cost_inps_pct', 'cost_inail_pct', 'cost_tfr_pct', 'cost_apprentice_inps_pct', 'cost_dirigente_extra_pct', 'irpef_brackets', 'employee_inps_pct', 'addizionale_regionale_pct', 'addizionale_comunale_pct', 'function_allowance_share', 'deadline_alert_days'];

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
r.get('/areas', ah(async (_req, res) => res.json(await many('SELECT a.*, (SELECT count(*)::int FROM resources r WHERE r.area_id=a.id AND r.status IN (\'ATTIVO\',\'IMPEGNO\')) AS headcount FROM areas a ORDER BY sort_order, name'))));
r.post('/areas', requireWrite, ah(async (req, res) => {
  const d = parse(z.object({ name: z.string().min(2).max(120), sort_order: z.number().int().default(100) }), req.body);
  const row = await one('INSERT INTO areas(name, sort_order) VALUES ($1,$2) RETURNING *', [d.name, d.sort_order]);
  await audit(req, 'AREA_CREATE', 'area', row.id, d);
  res.status(201).json(row);
}));
r.put('/areas/:id', requireWrite, ah(async (req, res) => {
  const d = parse(z.object({ name: z.string().min(2).max(120).optional(), sort_order: z.number().int().optional(), active: z.boolean().optional() }), req.body);
  const cols = Object.keys(d);
  if (cols.length) await q(`UPDATE areas SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(', ')} WHERE id=$1`, [Number(req.params.id), ...cols.map((c) => d[c])]);
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
