import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { one, many, q } from '../db.js';
import { ah, bad, notFound, audit, parse } from '../lib/util.js';
import { requireWrite, requireRole } from '../lib/access.js';

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });

const unitSchema = z.object({
  parent_id: z.number().int().nullable().optional(),
  kind: z.enum(['DIREZIONE', 'LINEA', 'SEDE', 'FUNZIONE', 'STAFF']).default('FUNZIONE'),
  name: z.string().trim().min(1).max(120),
  role_title: z.string().trim().max(160).nullable().optional(),
  head_name: z.string().trim().max(160).nullable().optional(),
  resource_id: z.number().int().nullable().optional(),
  area_id: z.number().int().nullable().optional(),
  tbd: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  sort_order: z.number().int().optional(),
});

/** Albero dell'organigramma con risoluzione del responsabile (risorsa collegata o omonima) e dei riporti diretti. */
export async function loadOrgTree() {
  const units = await many(`SELECT u.*, a.name AS area_name FROM org_units u LEFT JOIN areas a ON a.id=u.area_id ORDER BY u.sort_order, u.id`);
  const people = await many(`SELECT id, kind, status, first_name, last_name, sex, area_id, manager_id, cv_attachment_id FROM resources WHERE status <> 'CESSATO'`);
  const byId = Object.fromEntries(people.map((p) => [p.id, p]));
  const byName = {};
  for (const p of people) byName[`${p.first_name} ${p.last_name}`.toLowerCase().replace(/\s+/g, ' ')] = p;
  const reports = {};
  for (const p of people) if (p.manager_id) reports[p.manager_id] = (reports[p.manager_id] || 0) + 1;
  const nodes = units.map((u) => {
    let res = u.resource_id ? byId[u.resource_id] : null;
    if (!res && u.head_name) res = byName[u.head_name.toLowerCase().replace(/\s+/g, ' ')] || null;
    return {
      ...u,
      resource: res ? { id: res.id, kind: res.kind, status: res.status, first_name: res.first_name, last_name: res.last_name, direct_reports: reports[res.id] || 0 } : null,
      resolved_by: u.resource_id ? 'LINK' : res ? 'NAME' : null,
      children: [],
    };
  });
  const map = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const roots = [];
  for (const n of nodes) { if (n.parent_id && map[n.parent_id]) map[n.parent_id].children.push(n); else roots.push(n); }
  return { roots, nodes, people };
}

r.get('/', ah(async (_req, res) => {
  const { roots, nodes } = await loadOrgTree();
  const documents = await many(`SELECT d.id, d.title, d.filename, d.mime, d.size, d.uploaded_at, u.full_name AS uploaded_by_name FROM ccnl_documents d LEFT JOIN users u ON u.id=d.uploaded_by WHERE d.scope='ORG' ORDER BY d.uploaded_at DESC`);
  // Linee di riporto effettive, ricavate dal campo "responsabile" delle risorse
  const people = await many(`SELECT r.id, r.kind, r.status, r.first_name, r.last_name, r.manager_id, a.name AS area_name,
      coalesce(e.job_title, l.role_description) AS job_title
    FROM resources r LEFT JOIN areas a ON a.id=r.area_id LEFT JOIN employments e ON e.resource_id=r.id LEFT JOIN lp_contracts l ON l.resource_id=r.id
    WHERE r.status IN ('ATTIVO','IMPEGNO') ORDER BY r.last_name, r.first_name`);
  const counts = { units: nodes.length, tbd: nodes.filter((n) => n.tbd).length, linked: nodes.filter((n) => n.resource).length, unlinked: nodes.filter((n) => !n.resource && !n.tbd && n.head_name).length };
  res.json({ tree: roots, counts, documents, reporting: people });
}));

r.post('/units', requireWrite, ah(async (req, res) => {
  const d = parse(unitSchema, req.body);
  if (d.parent_id && !(await one('SELECT 1 FROM org_units WHERE id=$1', [d.parent_id]))) throw bad('Unità padre inesistente');
  const row = await one(`INSERT INTO org_units(parent_id, kind, name, role_title, head_name, resource_id, area_id, tbd, notes, sort_order)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, coalesce($10, (SELECT coalesce(max(sort_order),0)+10 FROM org_units WHERE parent_id IS NOT DISTINCT FROM $1))) RETURNING id`,
    [d.parent_id ?? null, d.kind, d.name, d.role_title ?? null, d.head_name ?? null, d.resource_id ?? null, d.area_id ?? null, Boolean(d.tbd), d.notes ?? null, d.sort_order ?? null]);
  await audit(req, 'ORG_UNIT_CREATE', 'org_unit', row.id, { name: d.name });
  res.status(201).json(row);
}));

r.put('/units/:id', requireWrite, ah(async (req, res) => {
  const id = Number(req.params.id);
  const cur = await one('SELECT * FROM org_units WHERE id=$1', [id]);
  if (!cur) throw notFound('Unità inesistente');
  const d = parse(unitSchema.partial(), req.body);
  if (d.parent_id !== undefined) {
    if (d.parent_id === id) throw bad('Un\'unità non può dipendere da sé stessa');
    // impedisce cicli: il nuovo padre non deve essere un discendente
    let p = d.parent_id; const seen = new Set();
    while (p) { if (p === id) throw bad('Spostamento non valido: creerebbe un ciclo'); if (seen.has(p)) break; seen.add(p); p = (await one('SELECT parent_id FROM org_units WHERE id=$1', [p]))?.parent_id; }
  }
  const cols = Object.keys(d);
  if (!cols.length) return res.json({ ok: true });
  await q(`UPDATE org_units SET ${cols.map((k, i) => `${k}=$${i + 2}`).join(', ')}, updated_at=now() WHERE id=$1`, [id, ...cols.map((k) => d[k])]);
  await audit(req, 'ORG_UNIT_UPDATE', 'org_unit', id, d);
  res.json({ ok: true });
}));

r.delete('/units/:id', requireRole('ADMIN'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const cur = await one('SELECT * FROM org_units WHERE id=$1', [id]);
  if (!cur) throw notFound('Unità inesistente');
  if (!cur.parent_id) throw bad('La radice dell\'organigramma non si elimina');
  await q('DELETE FROM org_units WHERE id=$1', [id]);
  await audit(req, 'ORG_UNIT_DELETE', 'org_unit', id, { name: cur.name });
  res.json({ ok: true });
}));

/** Allinea il campo "responsabile" delle risorse all'organigramma: il responsabile di ogni unità riporta al responsabile dell'unità padre. */
r.post('/align-managers', requireRole('ADMIN'), ah(async (req, res) => {
  const { roots, nodes } = await loadOrgTree();
  const map = Object.fromEntries(nodes.map((n) => [n.id, n]));
  // ordine ampiezza-prima: chi compare in più unità viene allineato sull'unità più alta
  const ordered = []; const queue = [...roots];
  while (queue.length) { const n = queue.shift(); ordered.push(n); queue.push(...n.children); }
  const done = new Set(); let updated = 0; const log = [];
  for (const n of ordered) {
    if (!n.resource || !n.parent_id || done.has(n.resource.id)) continue;
    done.add(n.resource.id);
    let p = map[n.parent_id]; while (p && (!p.resource || p.resource.id === n.resource.id)) p = p.parent_id ? map[p.parent_id] : null;
    if (!p) continue;
    const cur = await one('SELECT manager_id FROM resources WHERE id=$1', [n.resource.id]);
    if (cur?.manager_id === p.resource.id) continue;
    await q('UPDATE resources SET manager_id=$2, updated_at=now() WHERE id=$1', [n.resource.id, p.resource.id]);
    updated++; log.push(`${n.resource.first_name} ${n.resource.last_name} → riporta a ${p.resource.first_name} ${p.resource.last_name}`);
  }
  await audit(req, 'ORG_ALIGN_MANAGERS', 'org_unit', null, { updated });
  res.json({ updated, log });
}));

// Documento di riferimento (organigramma ufficiale, PDF)
r.post('/documents', requireRole('ADMIN'), upload.single('file'), ah(async (req, res) => {
  if (!req.file) throw bad('File mancante');
  const title = String(req.body.title || req.file.originalname).slice(0, 200);
  const filename = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const row = await one(`INSERT INTO ccnl_documents(scope, title, filename, mime, size, data, uploaded_by) VALUES ('ORG',$1,$2,$3,$4,$5,$6) RETURNING id`, [title, filename, req.file.mimetype, req.file.size, req.file.buffer, req.user.id]);
  await audit(req, 'ORG_DOCUMENT_UPLOAD', 'ccnl_document', row.id, { title });
  res.status(201).json(row);
}));

export default r;
