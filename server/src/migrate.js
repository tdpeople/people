import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, one, q } from './db.js';
import { config } from './config.js';
import { CCNL_LEVELS, CCNL_SECTIONS, DOSSIER_REQUIREMENTS, AREAS, WORK_SITES, DEFAULT_SETTINGS, ORG_UNITS } from './lib/seedData.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`);
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
      await c.query('COMMIT');
      console.log(`[migrate] applicata ${f}`);
    } catch (e) {
      await c.query('ROLLBACK');
      throw new Error(`Migrazione ${f} fallita: ${e.message}`);
    } finally {
      c.release();
    }
  }
  await seed();
}

async function seed() {
  // Impostazioni di default (solo se assenti)
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await q('INSERT INTO app_settings(key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING', [k, v]);
  }
  // Aree aziendali
  for (const [i, name] of AREAS.entries()) {
    await q('INSERT INTO areas(name, sort_order) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING', [name, (i + 1) * 10]);
  }
  // Sedi di lavoro
  if ((await one('SELECT count(*)::int AS n FROM work_sites')).n === 0) {
    for (const s of WORK_SITES) await q('INSERT INTO work_sites(name, address) VALUES ($1,$2)', [s.name, s.address]);
  }
  // CCNL: livelli e minimi tabellari
  for (const [i, l] of CCNL_LEVELS.entries()) {
    const row = await one(
      `INSERT INTO ccnl_levels(ccnl, level, description, sort_order, probation_days) VALUES ('STUDI_PROFESSIONALI',$1,$2,$3,$4)
       ON CONFLICT (ccnl, level) DO UPDATE SET description=EXCLUDED.description, probation_days=EXCLUDED.probation_days RETURNING id`,
      [l.level, l.description, (i + 1) * 10, l.probation_days],
    );
    for (const m of l.minimums) {
      await q('INSERT INTO ccnl_minimums(level_id, valid_from, amount, enac) VALUES ($1,$2,$3,$4) ON CONFLICT (level_id, valid_from) DO NOTHING', [row.id, m.from, m.amount, m.enac ?? null]);
    }
  }
  // Sezioni di sintesi del CCNL (solo al primo avvio: poi sono modificabili)
  if ((await one('SELECT count(*)::int AS n FROM ccnl_sections')).n === 0) {
    for (const [i, s] of CCNL_SECTIONS.entries()) await q('INSERT INTO ccnl_sections(title, body, sort_order) VALUES ($1,$2,$3)', [s.title, s.body, (i + 1) * 10]);
  }
  // Organigramma (solo al primo avvio: poi è modificabile dall'app)
  if ((await one('SELECT count(*)::int AS n FROM org_units')).n === 0) {
    const insert = async (u, parentId, order) => {
      const area = u.area ? (await one('SELECT id FROM areas WHERE lower(name)=lower($1)', [u.area]))?.id || null : null;
      const row = await one('INSERT INTO org_units(parent_id, kind, name, role_title, head_name, area_id, tbd, notes, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
        [parentId, u.kind || 'FUNZIONE', u.name, u.role_title || null, u.head_name || null, area, Boolean(u.tbd), u.notes || null, order]);
      for (const [i, c] of (u.children || []).entries()) await insert(c, row.id, (i + 1) * 10);
    };
    await insert(ORG_UNITS, null, 10);
  }
  // Organigramma ufficiale (PDF da TD-SGI-IDL007_01 Allegato 1), solo se non presente
  if ((await one("SELECT count(*)::int AS n FROM ccnl_documents WHERE scope='ORG'")).n === 0) {
    const assetDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');
    const name = 'TD-SGI-IDL007_01 - Allegato 1 - Organigramma Toscana Diagnostica.pdf';
    const file = path.join(assetDir, name);
    if (fs.existsSync(file)) {
      const buf = fs.readFileSync(file);
      await q("INSERT INTO ccnl_documents(scope, title, filename, mime, size, data) VALUES ('ORG',$1,$2,'application/pdf',$3,$4)", ['TD-SGI-IDL007_01 - Allegato 1 - Organigramma Toscana Diagnostica (agg. 22/09/2026)', name, buf.length, buf]);
    }
  }
  // Checklist dossier
  for (const r of DOSSIER_REQUIREMENTS) {
    await q(`INSERT INTO dossier_requirements(kind, category, label, required, renew_months, sort_order) VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (kind, category) DO NOTHING`, [r.kind, r.category, r.label, r.required, r.renew_months ?? null, r.sort_order]);
  }
  // Primo amministratore
  if (config.seed.adminEmail) {
    const ex = await one('SELECT id FROM users WHERE lower(email)=lower($1)', [config.seed.adminEmail]);
    if (!ex) {
      if (!config.seed.adminPassword || config.seed.adminPassword.length < 12) {
        throw new Error('SEED_ADMIN_PASSWORD obbligatoria (min 12 caratteri) per creare il primo amministratore');
      }
      const hash = await bcrypt.hash(config.seed.adminPassword, 12);
      await q(`INSERT INTO users (email, full_name, role, auth_provider, password_hash, must_change_password) VALUES ($1,$2,'ADMIN','BOTH',$3,TRUE)`,
        [config.seed.adminEmail, config.seed.adminName, hash]);
      console.log(`[seed] creato amministratore ${config.seed.adminEmail}`);
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  migrate().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
