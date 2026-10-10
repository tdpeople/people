import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, canWrite, isAdmin } from '../auth.jsx';
import { useApi, Card, Field, ErrorBox, Loading, Empty, Badge, Modal, ConfirmModal, useToast, Icon } from '../components/ui.jsx';
import { itDateTime, bytes, KIND } from '../format.js';

const KINDS = { DIREZIONE: 'Direzione', LINEA: 'Linea di business', FUNZIONE: 'Funzione', SEDE: 'Sede / punto prelievo', STAFF: 'Staff (C-level, Direttore Sanitario, manager di supporto)' };

function NodeCard({ n, writer, admin, onEdit, onAdd, onDelete, staff }) {
  return (
    <div className={`org-node k-${n.kind} ${n.tbd ? 'tbd' : ''} ${staff ? 'staff' : ''}`}>
      {writer && (
        <div className="tools">
          <button title="Modifica" onClick={() => onEdit(n)}><Icon name="edit" /></button>
          {!staff && <button title="Aggiungi unità dipendente" onClick={() => onAdd(n)}><Icon name="plus" /></button>}
          {admin && n.parent_id && <button title="Elimina" onClick={() => onDelete(n)}><Icon name="trash" /></button>}
        </div>
      )}
      <div className="unit">{staff ? n.role_title || n.name : n.name}</div>
      <div className="head">
        {n.resource ? <Link to={`/risorse/${n.resource.id}`}>{n.resource.first_name} {n.resource.last_name}</Link>
          : n.tbd || !n.head_name ? <span className="muted">Da definire</span> : n.head_name}
      </div>
      {!staff && n.role_title && <div className="role">{n.role_title}</div>}
      <div className="meta">
        {n.resource && <Badge tone={KIND[n.resource.kind]?.tone}>{KIND[n.resource.kind]?.label || n.resource.kind}</Badge>}
        {n.resource?.status === 'IMPEGNO' && <Badge tone="blue">in arrivo</Badge>}
        {n.resource && n.resource.direct_reports > 0 && <Badge>{n.resource.direct_reports} riporti</Badge>}
        {!n.resource && n.head_name && !n.tbd && <Badge tone="grey">non in anagrafica</Badge>}
        {n.notes && <span title={n.notes} className="small muted">*</span>}
      </div>
    </div>
  );
}

function Node({ n, writer, admin, onEdit, onAdd, onDelete, depth, maxDepth }) {
  const staff = n.children.filter((c) => c.kind === 'STAFF');
  const kids = (maxDepth == null || depth < maxDepth ? n.children : []).filter((c) => c.kind !== 'STAFF');
  const common = { writer, admin, onEdit, onAdd, onDelete };
  return (
    <li>
      <NodeCard n={n} {...common} />
      {staff.length > 0 && <div className="org-staff">{staff.map((c) => <NodeCard key={c.id} n={c} {...common} staff />)}</div>}
      {kids.length > 0 && <ul>{kids.map((c) => <Node key={c.id} n={c} {...common} depth={depth + 1} maxDepth={maxDepth} />)}</ul>}
    </li>
  );
}

function PersonNode({ p, byManager, depth, maxDepth }) {
  const kids = byManager[p.id] || [];
  const show = maxDepth == null || depth < maxDepth ? kids : [];
  const dir = p.contract_type === 'DIRIGENTE';
  return (
    <li>
      <div className={`org-node ${dir ? 'k-DIREZIONE' : p.kind === 'LP' ? 'k-SEDE' : 'k-FUNZIONE'}`}>
        <div className="unit">{p.area_name || (p.kind === 'LP' ? 'Libero professionista' : 'Dipendente')}</div>
        <div className="head"><Link to={`/risorse/${p.id}`}>{p.first_name} {p.last_name}</Link></div>
        {p.job_title && <div className="role">{p.job_title}</div>}
        <div className="meta">
          <Badge tone={KIND[p.kind]?.tone}>{KIND[p.kind]?.label || p.kind}</Badge>
          {p.status === 'IMPEGNO' && <Badge tone="blue">in arrivo</Badge>}
          {kids.length > 0 && <Badge>{kids.length} riporti</Badge>}
          {p.approver_id && p.approver_id !== p.manager_id && <Badge tone="grey" >ferie: {p.approver_name}</Badge>}
        </div>
      </div>
      {show.length > 0 && <ul>{show.map((k) => <PersonNode key={k.id} p={k} byManager={byManager} depth={depth + 1} maxDepth={maxDepth} />)}</ul>}
      {!show.length && kids.length > 0 && <ul><li><div className="org-node tbd" style={{ width: 150, textAlign: 'center' }}><span className="small muted">+{kids.length} persone</span></div></li></ul>}
    </li>
  );
}

function ReportNode({ p, byManager }) {
  const kids = byManager[p.id] || [];
  return (
    <li>
      <div className="p">
        <Link to={`/risorse/${p.id}`} className="strong">{p.last_name} {p.first_name}</Link>
        <span className="small muted">{p.job_title || '–'}{p.area_name ? ` · ${p.area_name}` : ''}</span>
        <Badge tone={KIND[p.kind]?.tone}>{KIND[p.kind]?.label || p.kind}</Badge>
        {kids.length > 0 && <Badge>{kids.length}</Badge>}
      </div>
      {kids.length > 0 && <ul>{kids.map((k) => <ReportNode key={k.id} p={k} byManager={byManager} />)}</ul>}
    </li>
  );
}

export default function Organigramma() {
  const { user } = useAuth();
  const toast = useToast();
  const d = useApi('/org');
  const areas = useApi('/areas');
  const people = useApi('/resources?status=ATTIVO,IMPEGNO');
  const [view, setView] = useState('persone');
  const [depthLimit, setDepthLimit] = useState(3);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [upload, setUpload] = useState(false);
  const [align, setAlign] = useState(false);
  const writer = canWrite(user); const admin = isAdmin(user);
  const flat = useMemo(() => { const out = []; const walk = (n, depth) => { out.push({ ...n, depth }); n.children.forEach((c) => walk(c, depth + 1)); }; (d.data?.tree || []).forEach((n) => walk(n, 0)); return out; }, [d.data]);
  if (d.error) return <div className="page"><ErrorBox error={d.error} /></div>;
  if (!d.data) return <div className="page"><Loading /></div>;
  const root = d.data.tree[0];
  const lines = root ? root.children : [];
  const tabs = [['persone', 'Persone e riporti'], ['direzione', 'Struttura SGI: Direzione'], ...lines.filter((l) => l.children.some((c) => c.kind !== 'STAFF')).map((l) => [`u${l.id}`, l.name]), ['completo', 'Struttura completa'], ['riporti', 'Elenco riporti'], ['documento', `Documento ufficiale${d.data.documents.length ? '' : ' (assente)'}`]];
  const current = view.startsWith('u') ? lines.find((l) => `u${l.id}` === view) : null;
  const byManager = {}; for (const p of d.data.reporting) (byManager[p.manager_id || 0] = byManager[p.manager_id || 0] || []).push(p);
  const topLevel = (byManager[0] || []);
  const doc = d.data.documents[0];

  const save = async () => {
    const body = { ...edit };
    for (const k of ['role_title', 'head_name', 'notes']) if (body[k] === '') body[k] = null;
    body.resource_id = body.resource_id ? Number(body.resource_id) : null;
    body.area_id = body.area_id ? Number(body.area_id) : null;
    body.parent_id = body.parent_id ? Number(body.parent_id) : null;
    const keys = ['parent_id', 'kind', 'name', 'role_title', 'head_name', 'resource_id', 'area_id', 'tbd', 'notes'];
    const payload = Object.fromEntries(keys.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
    try {
      if (edit.id) await api.put(`/org/units/${edit.id}`, payload); else await api.post('/org/units', payload);
      setEdit(null); d.reload(); toast('Organigramma aggiornato');
    } catch (e) { toast(e.message, 'err'); }
  };
  const runAlign = async () => { try { const r = await api.post('/org/align-managers', {}); toast(`Responsabili aggiornati: ${r.updated}`); setAlign(false); d.reload(); } catch (e) { toast(e.message, 'err'); } };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Organigramma</h1><div className="sub">Struttura organizzativa, deleghe e responsabili (TD-SGI-IDL007 Allegato 1). I nomi collegati all'anagrafica aprono la scheda; le unità tratteggiate sono da assegnare.</div></div>
        <div className="row">
          {admin && <button className="btn ghost" onClick={() => setAlign(true)} title="Imposta il responsabile di ogni persona in base all'organigramma"><Icon name="link" />Allinea responsabili</button>}
          {admin && <button className="btn ghost" onClick={() => setUpload(true)}><Icon name="upload" />Carica PDF ufficiale</button>}
          <button className="btn" onClick={() => window.print()}><Icon name="print" />Stampa</button>
        </div>
      </div>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="lbl">Unità organizzative</div><div className="val">{d.data.counts.units}</div></div>
        <div className="card kpi"><div className="lbl">Responsabili in anagrafica</div><div className="val">{d.data.counts.linked}</div></div>
        <div className="card kpi"><div className="lbl">Responsabili non censiti</div><div className="val">{d.data.counts.unlinked}</div></div>
        <div className="card kpi"><div className="lbl">Posizioni da definire</div><div className="val">{d.data.counts.tbd}</div></div>
      </div>
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>

      {(view === 'direzione' || view === 'completo' || current) && (
        <Card title={view === 'direzione' ? 'Direzione e linee di business' : view === 'completo' ? 'Organigramma completo' : current.name} flush>
          <div className="org-wrap">
            {!root ? <Empty>Organigramma vuoto.</Empty> : (
              <ul className="org-tree">
                {view === 'direzione' && <Node n={root} writer={writer} admin={admin} onEdit={setEdit} onAdd={(p) => setEdit({ parent_id: p.id, kind: p.kind === 'DIREZIONE' ? 'LINEA' : 'FUNZIONE', name: '', tbd: false })} onDelete={setDel} depth={0} maxDepth={1} />}
                {view === 'completo' && <Node n={root} writer={writer} admin={admin} onEdit={setEdit} onAdd={(p) => setEdit({ parent_id: p.id, kind: 'FUNZIONE', name: '', tbd: false })} onDelete={setDel} depth={0} />}
                {current && <Node n={{ ...root, children: [current] }} writer={writer} admin={admin} onEdit={setEdit} onAdd={(p) => setEdit({ parent_id: p.id, kind: p.kind === 'LINEA' ? 'SEDE' : 'FUNZIONE', name: '', tbd: false })} onDelete={setDel} depth={0} />}
              </ul>
            )}
          </div>
          <div className="org-legend"><span className="l-DIREZIONE">Direzione</span><span className="l-STAFF">Staff e Direzione Sanitaria</span><span className="l-LINEA">Linea di business</span><span className="l-FUNZIONE">Funzione</span><span className="l-SEDE">Sede / punto prelievo</span><span className="l-TBD">Da definire</span></div>
        </Card>
      )}

      {view === 'persone' && (
        <Card title={"Organigramma delle persone (dal campo \"Riporta a\" di ogni scheda)"} flush actions={<span className="row small muted">Livelli visibili <select value={depthLimit} onChange={(e) => setDepthLimit(Number(e.target.value))} style={{ width: 70, height: 30, padding: '0 6px' }}>{[1, 2, 3, 4, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select></span>}>
          <div className="org-wrap">
            {!topLevel.length ? <Empty>Nessuna risorsa attiva.</Empty> : <ul className="org-tree">{topLevel.map((p) => <PersonNode key={p.id} p={p} byManager={byManager} depth={0} maxDepth={depthLimit} />)}</ul>}
          </div>
          <div className="bd small muted">Ogni persona compare sotto chi ha indicato come responsabile gerarchico nella scheda; chi non ha un responsabile è in cima. Il badge "ferie" segnala quando l'approvatore di ferie e permessi è diverso dal responsabile. {admin ? 'Con "Allinea responsabili" i responsabili delle unità SGI vengono riportati nelle schede.' : ''}</div>
        </Card>
      )}
      {view === 'riporti' && (
        <div className="grid g2">
          <Card title="Chi riporta a chi (dal campo Responsabile delle schede)">
            {!topLevel.length ? <Empty>Nessuna risorsa attiva.</Empty> : <ul className="report-tree">{topLevel.map((p) => <ReportNode key={p.id} p={p} byManager={byManager} />)}</ul>}
          </Card>
          <Card title="Come leggere questa vista">
            <p>L'organigramma descrive le unità e chi le guida; le linee di riporto sono invece ricavate dal campo "Responsabile" di ogni risorsa e governano le deleghe operative (valutazioni MBO, approvazioni, scadenze).</p>
            <p>Le persone al primo livello non hanno un responsabile impostato. {admin ? 'Con "Allinea responsabili" il responsabile di ogni unità viene assegnato come responsabile delle persone a capo delle unità dipendenti; per il resto del personale il responsabile si imposta nella scheda.' : 'Il responsabile si imposta nella scheda della risorsa.'}</p>
            <p className="small muted">Risorse considerate: attive e in impegno ({d.data.reporting.length}).</p>
          </Card>
        </div>
      )}

      {view === 'documento' && (
        <Card title="Organigramma ufficiale (SGI)" flush actions={doc && <><a className="btn sm ghost" href={`/api/ccnl/documents/${doc.id}/download`}>Scarica</a>{admin && <button className="btn sm ghost" onClick={async () => { await api.del(`/ccnl/documents/${doc.id}`); d.reload(); }}>Rimuovi</button>}</>}>
          {!doc ? <Empty>Nessun documento caricato. Carica il PDF di TD-SGI-IDL007 Allegato 1: resta consultabile qui come riferimento ufficiale, mentre l'albero sopra è la versione operativa modificabile.</Empty> : (
            <>
              <div className="bd small muted">{doc.title} · {doc.filename} ({bytes(doc.size)}) · caricato {itDateTime(doc.uploaded_at)}{doc.uploaded_by_name ? ` da ${doc.uploaded_by_name}` : ''}{d.data.documents.length > 1 ? ` · versioni precedenti: ${d.data.documents.length - 1}` : ''}</div>
              {doc.mime === 'application/pdf' ? <iframe title="organigramma" src={`/api/ccnl/documents/${doc.id}/download?inline=1`} style={{ width: '100%', height: '75vh', border: 0 }} /> : <div className="bd">Anteprima disponibile solo per PDF.</div>}
            </>
          )}
        </Card>
      )}

      {edit && (
        <Modal title={edit.id ? `Modifica unità: ${edit.name}` : 'Nuova unità organizzativa'} onClose={() => setEdit(null)} wide footer={<><button className="btn ghost" onClick={() => setEdit(null)}>Annulla</button><button className="btn" disabled={!edit.name} onClick={save}>Salva</button></>}>
          <div className="form-grid">
            <Field label="Nome dell'unità"><input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="es. Core Lab, Livorno Centro" /></Field>
            <Field label="Tipo"><select value={edit.kind || 'FUNZIONE'} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Ruolo del responsabile"><input value={edit.role_title || ''} onChange={(e) => setEdit({ ...edit, role_title: e.target.value })} placeholder="es. Direttore Tecnico" /></Field>
            <Field label="Dipende da">
              <select value={edit.parent_id || ''} onChange={(e) => setEdit({ ...edit, parent_id: e.target.value })} disabled={edit.id && !edit.parent_id}>
                <option value="">– (radice)</option>
                {flat.filter((u) => u.id !== edit.id).map((u) => <option key={u.id} value={u.id}>{'  '.repeat(u.depth)}{u.name}{u.resource ? ` · ${u.resource.first_name} ${u.resource.last_name}` : ''}</option>)}
              </select>
            </Field>
            <Field label="Responsabile (risorsa in anagrafica)" help="Prevale sul nome libero. Lascia vuoto per persone non ancora censite.">
              <select value={edit.resource_id || ''} onChange={(e) => setEdit({ ...edit, resource_id: e.target.value })}>
                <option value="">–</option>
                {(people.data || []).map((p) => <option key={p.id} value={p.id}>{p.last_name} {p.first_name} · {KIND[p.kind]?.label || p.kind}</option>)}
              </select>
            </Field>
            <Field label="Nome libero (se non in anagrafica)"><input value={edit.head_name || ''} onChange={(e) => setEdit({ ...edit, head_name: e.target.value })} /></Field>
            <Field label="Area aziendale"><select value={edit.area_id || ''} onChange={(e) => setEdit({ ...edit, area_id: e.target.value })}><option value="">–</option>{(areas.data || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            <Field label="Posizione da definire"><label className="row" style={{ gap: 8 }}><input type="checkbox" checked={Boolean(edit.tbd)} onChange={(e) => setEdit({ ...edit, tbd: e.target.checked })} /> ancora senza responsabile (TBD)</label></Field>
            <Field label="Note" className="span2"><input value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
      {del && <ConfirmModal danger title="Elimina unità" text={`Eliminare "${del.name}" e tutte le unità dipendenti?`} confirmText="Elimina" onClose={() => setDel(null)} onConfirm={async () => { await api.del(`/org/units/${del.id}`); setDel(null); d.reload(); }} />}
      {align && <ConfirmModal title="Allinea responsabili" text="Per ogni unità con responsabile in anagrafica, la persona a capo dell'unità viene assegnata come responsabile delle persone a capo delle unità dipendenti. Le altre assegnazioni non vengono toccate. Procedere?" confirmText="Allinea" onClose={() => setAlign(false)} onConfirm={runAlign} />}
      {upload && <UploadDoc onClose={() => setUpload(false)} onSaved={() => { setUpload(false); d.reload(); setView('documento'); }} />}
    </div>
  );
}

function UploadDoc({ onClose, onSaved }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('TD-SGI-IDL007_01 - Allegato 1 - Organigramma Toscana Diagnostica');
  const [err, setErr] = useState(null);
  const save = async () => { if (!file) return setErr(new Error('Seleziona un file')); try { const fd = new FormData(); fd.append('file', file); fd.append('title', title || file.name); await api.upload('/org/documents', fd); onSaved(); } catch (e) { setErr(e); } };
  return <Modal title="Carica organigramma ufficiale (PDF)" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Annulla</button><button className="btn" onClick={save}>Carica</button></>}><ErrorBox error={err} /><div className="form-grid"><Field label="Titolo" className="span2"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field><Field label="File PDF" className="span2"><input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field></div></Modal>;
}
