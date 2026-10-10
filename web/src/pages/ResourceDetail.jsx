import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, canWrite, isAdmin, seesCosts } from '../auth.jsx';
import { useApi, Card, Field, ErrorBox, Loading, Empty, Badge, KindBadge, StatusBadge, Modal, PromptModal, ConfirmModal, useToast, Icon } from '../components/ui.jsx';
import { PersonForm, EmploymentForm, LpForm } from '../components/forms.jsx';
import { eur, itDate, itDateTime, bytes, age, CONTRACT, LEVEL_LABEL, LETTER_STATUS, DEADLINE_STATE, FEE_TYPE, SEX } from '../format.js';

const DOC_LABEL = { CONTRATTO: 'Lettera di assunzione', MBO: 'Piano MBO', LETTERA_IMPEGNO: 'Lettera di impegno', CONTRATTO_LP: 'Contratto LP' };

function Row({ k, v }) { return v == null || v === '' ? null : <div className="row" style={{ justifyContent: 'space-between', borderBottom: '1px dashed var(--line)', padding: '5px 0' }}><span className="muted">{k}</span><span className="strong" style={{ textAlign: 'right' }}>{v}</span></div>; }

export default function ResourceDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const d = useApi(`/resources/${id}`);
  const [tab, setTab] = useState('scheda');
  const [modal, setModal] = useState(null);
  const [preview, setPreview] = useState(null);
  const writer = canWrite(user);
  const costs = seesCosts(user);
  if (d.error) return <div className="page"><ErrorBox error={d.error} /></div>;
  if (!d.data) return <div className="page"><Loading /></div>;
  const { resource: r, employment: e, lp, letters, documents, attachments, deadlines, checklist, payroll, category_labels: CL } = d.data;
  const isEmp = r.kind === 'DIPENDENTE';
  const cats = checklist.map((c) => ({ value: c.category, label: c.label }));

  const generate = async (kind) => { try { const res = await api.post(`/resources/${id}/documents/generate`, { kind }); toast(`${DOC_LABEL[kind]} generato (v${res.version})${res.has_pdf ? ', PDF pronto' : ', solo DOCX'}${(res.missing || []).length ? ` · ${res.missing.length} segnaposto da completare` : ''}`); d.reload(); } catch (e2) { toast(e2.message, 'err'); } };
  const archive = async (doc) => { try { await api.post(`/documents/${doc.id}/archive`, { category: doc.kind === 'MBO' ? 'MBO' : doc.kind === 'LETTERA_IMPEGNO' ? 'LETTERA_IMPEGNO' : 'CONTRATTO_FIRMATO', signed: false }); toast('Archiviato nel dossier'); d.reload(); } catch (e2) { toast(e2.message, 'err'); } };
  const setStatus = async (status) => { await api.put(`/resources/${id}`, { status, terminated_at: status === 'CESSATO' ? new Date().toISOString().slice(0, 10) : null }); d.reload(); };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 8 }}><KindBadge kind={r.kind} /><StatusBadge status={r.status} />{r.area_name && <Badge tone="grey">{r.area_name}</Badge>}</div>
          <h1 style={{ marginTop: 6 }}>{r.title ? `${r.title} ` : ''}{r.first_name} {r.last_name}</h1>
          <div className="sub">{isEmp ? `${r.job_title || 'Mansione n.d.'}${r.level ? ` · ${LEVEL_LABEL[r.level] || r.level}` : ''}${r.contract_type ? ` · ${CONTRACT[r.contract_type]}` : ''}` : `${r.discipline || 'Disciplina n.d.'} · libero professionista`}{r.manager_name ? ` · riporta a ${r.manager_name}` : ''}</div>
        </div>
        <div className="row">
          {writer && isEmp && e && <button className="btn" onClick={() => generate('CONTRATTO')}><Icon name="file" />Genera contratto</button>}
          {writer && isEmp && e?.mbo_enabled && <button className="btn ghost" onClick={() => generate('MBO')}><Icon name="file" />Genera MBO</button>}
          {writer && !isEmp && lp && <button className="btn" onClick={() => generate('CONTRATTO_LP')}><Icon name="file" />Genera contratto LP</button>}
          {writer && <button className="btn ghost" onClick={() => setModal('person')}><Icon name="edit" />Modifica anagrafica</button>}
        </div>
      </div>

      <div className="tabs">
        {[['scheda', 'Scheda'], ['dossier', `Dossier (${attachments.length})`], ['documenti', `Documenti generati (${documents.length})`], ['scadenze', `Scadenze (${deadlines.length})`], ['lettere', `Lettere di impegno (${letters.length})`]].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'scheda' && (
        <div className="grid g3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <Card title="Anagrafica">
            <Row k="Sesso" v={SEX[r.sex]} />
            <Row k="Nascita" v={[r.birth_place, itDate(r.birth_date), r.birth_date ? `(${age(r.birth_date)} anni)` : ''].filter(Boolean).join(' ')} />
            <Row k="Codice fiscale" v={r.tax_code} />
            <Row k="Partita IVA" v={r.vat_number} />
            <Row k="Telefono" v={r.phone} />
            <Row k="Email" v={r.email} />
            <Row k="Indirizzo" v={[r.address, r.zip, r.city, r.province ? `(${r.province})` : ''].filter(Boolean).join(' ')} />
            <Row k="Area" v={r.area_name} />
            <Row k="Responsabile" v={r.manager_id ? <Link to={`/risorse/${r.manager_id}`}>{r.manager_name}</Link> : null} />
            {(d.data.org_units || []).length > 0 && <Row k="Nell'organigramma" v={<Link to="/organigramma">{d.data.org_units.map((u) => `${u.role_title || 'Responsabile'} · ${u.name}`).join('; ')}</Link>} />}
            <Row k="Ingresso" v={itDate(r.hired_at)} />
            <Row k="Cessazione" v={itDate(r.terminated_at)} />
            {r.cv_attachment_id && <Row k="CV" v={<a href={`/api/resources/${id}/attachments/${r.cv_attachment_id}/download?inline=1`} target="_blank" rel="noreferrer">Apri CV</a>} />}
            {r.notes && <p className="small muted" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{r.notes}</p>}
            {writer && <div className="row" style={{ marginTop: 12 }}>
              {r.status !== 'CESSATO' && <button className="btn sm danger" onClick={() => setModal('cessa')}>Registra cessazione</button>}
              {r.status === 'CESSATO' && <button className="btn sm ghost" onClick={() => setStatus('ATTIVO')}>Riattiva</button>}
              {r.status === 'IMPEGNO' && <button className="btn sm" onClick={() => setStatus('ATTIVO')}>Segna come attivo</button>}
              {isAdmin(user) && <button className="btn sm danger" onClick={() => setModal('delete')}>Elimina</button>}
            </div>}
          </Card>
          {isEmp ? (
            <Card title="Rapporto di lavoro" actions={writer && <button className="btn sm ghost" onClick={() => setModal('employment')}>{e ? 'Modifica' : 'Inserisci'}</button>}>
              {!e ? <Empty>Dati contrattuali non ancora inseriti</Empty> : <>
                <Row k="Contratto" v={`${CONTRACT[e.contract_type]} · CCNL ${e.ccnl === 'STUDI_PROFESSIONALI' ? 'Studi Professionali' : e.ccnl.replace('_', ' ')}`} />
                <Row k="Livello / qualifica" v={`${LEVEL_LABEL[e.level] || e.level || '–'} · ${e.qualification || ''}`} />
                <Row k="Mansione" v={e.job_title} />
                <Row k="Orario" v={`${e.weekly_hours} ore su ${e.weekly_days} giorni${e.autonomous_hours ? ' · autonomia di orario' : ''}`} />
                <Row k="Decorrenza" v={itDate(e.start_date)} />
                <Row k="Scadenza" v={itDate(e.end_date)} />
                <Row k="Periodo di prova" v={`${e.probation}${e.probation_end ? ` (fino al ${itDate(e.probation_end)})` : ''}`} />
                <Row k="Sede" v={e.work_site} />
                <Row k="Benefit" v={(e.benefits || []).length ? e.benefits.join('; ') : 'Nessuno'} />
                <Row k="Smart working" v={e.smart_working ? 'Sì' : 'No'} />
                <Row k="Exit fee" v={e.exit_fee ? 'Sì' : null} />
                <Row k="Data lettera" v={itDate(e.letter_date)} />
                {e.notes && <p className="small muted" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{e.notes}</p>}
              </>}
            </Card>
          ) : (
            <Card title="Incarico professionale" actions={writer && <button className="btn sm ghost" onClick={() => setModal('lp')}>{lp ? 'Modifica' : 'Inserisci'}</button>}>
              {!lp ? <Empty>Dati dell'incarico non ancora inseriti</Empty> : <>
                <Row k="Disciplina" v={lp.discipline} />
                <Row k="Oggetto" v={lp.role_description} />
                <Row k="Durata" v={`${itDate(lp.start_date)} – ${itDate(lp.end_date)}${lp.auto_renew ? ` · rinnovo automatico, preavviso ${lp.notice_days} gg` : ''}`} />
                <Row k="Ordine" v={[lp.order_name, lp.order_province, lp.order_number ? `n. ${lp.order_number}` : '', lp.order_since ? `dal ${itDate(lp.order_since)}` : ''].filter(Boolean).join(' ')} />
                <Row k="Polizza RC" v={`massimale ${eur(lp.insurance_required)}${lp.insurance_policy ? ` · ${lp.insurance_policy}` : ''}${lp.insurance_expiry ? ` · scade ${itDate(lp.insurance_expiry)}` : ''}`} />
                <Row k="Titoli" v={(lp.degrees || []).join(' · ')} />
                <Row k="Regime IVA" v={lp.vat_regime} />
                <div className="subhead">Tariffario</div>
                <table className="t"><thead><tr><th>Tipo</th><th>Descrizione</th><th className="num">Importo</th></tr></thead><tbody>{(lp.fees || []).map((f, i) => <tr key={i}><td><Badge>{FEE_TYPE[f.type]}</Badge></td><td>{f.description}<div className="small muted">{f.category}{f.notes ? ` · ${f.notes}` : ''}</div></td><td className="num">{f.type === 'VARIABILE' ? `${f.amount}%` : `${eur(f.amount)}${f.unit ? `/${f.unit}` : ''}`}</td></tr>)}</tbody></table>
                {lp.notes && <p className="small muted" style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{lp.notes}</p>}
              </>}
            </Card>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {costs && (
              <Card title="Retribuzione e costo azienda">
                {isEmp && e ? <>
                  <Row k="RAL contrattuale" v={eur(e.ral)} />
                  {(e.ral_steps || []).map((s, i) => <Row key={i} k={`RAL dal ${itDate(s.from)}`} v={eur(s.ral)} />)}
                  <Row k="RAL vigente" v={eur(r.ral_current)} />
                  <Row k="Lordo mensile" v={`${eur(payroll?.decomposition.ral_monthly)} × ${e.monthly_payments}`} />
                  <Row k="Paga base" v={eur(e.base_pay ?? payroll?.decomposition.base_pay)} />
                  <Row k={e.superminimo_absorbable ? 'Superminimo assorbibile' : 'Superminimo non assorbibile'} v={eur(e.superminimo ?? payroll?.decomposition.superminimo)} />
                  <Row k="Indennità di funzione" v={eur(e.function_allowance ?? payroll?.decomposition.function_allowance)} />
                  {e.mbo_enabled && <Row k="MBO" v={`${e.mbo_amount ? `${eur(e.mbo_amount)} annui (cifra fissa)` : `${e.mbo_pct ?? '–'}% RAL`} · esercizio ${e.mbo_year || ''}${r.cost_mbo_max ? ` · costo azienda max ${eur(r.cost_mbo_max)}` : ''}`} />}
                  <div className="totals" style={{ marginTop: 12 }}>
                    <div className="line"><span>Coefficiente di costo</span><span>{r.cost_coefficient_used}</span></div>
                    <div className="big"><span>Costo annuo</span><span className="v">{eur(r.cost_annual)}</span></div>
                    <div className="line"><span>Costo mensile</span><span>{eur(r.cost_monthly)}</span></div>
                  </div>
                </> : !isEmp && lp ? <>
                  <Row k="Costo mensile stimato" v={eur(r.cost_monthly)} />
                  <Row k="Costo annuo stimato" v={eur(r.cost_annual)} />
                  <p className="small muted">Stima basata sui compensi fissi (o sul valore impostato nell'incarico); le componenti a prestazione e variabili non sono incluse.</p>
                </> : <Empty>Dati economici non disponibili</Empty>}
              </Card>
            )}
            <Card title="Completezza del dossier" flush>
              <table className="t"><tbody>{checklist.filter((c) => c.required || c.present).map((c) => <tr key={c.category}><td>{c.label}{c.renew_months ? <span className="small muted"> · rinnovo {c.renew_months} mesi</span> : ''}</td><td className="num">{c.present ? <Badge tone={c.expires_at && c.expires_at < new Date().toISOString().slice(0, 10) ? 'red' : 'green'}>{c.count} doc{c.expires_at ? ` · ${itDate(c.expires_at)}` : ''}</Badge> : <Badge tone={c.required ? 'red' : 'grey'}>{c.required ? 'Mancante' : '–'}</Badge>}</td></tr>)}</tbody></table>
            </Card>
          </div>
        </div>
      )}

      {tab === 'dossier' && (
        <Card title="Dossier online" actions={writer && <button className="btn" onClick={() => setModal('upload')}><Icon name="upload" />Carica allegato</button>} flush>
          {!attachments.length ? <Empty>Nessun allegato. Carica contratto firmato, documenti d'identità, titoli, iscrizioni e certificati.</Empty> : (
            <div className="table-wrap"><table className="t">
              <thead><tr><th>Categoria</th><th>File</th><th>Rilascio</th><th>Scadenza</th><th>Caricato</th><th className="num">Azioni</th></tr></thead>
              <tbody>{attachments.map((a) => {
                const exp = a.expires_at ? String(a.expires_at).slice(0, 10) : null;
                const tone = !exp ? 'grey' : exp < new Date().toISOString().slice(0, 10) ? 'red' : 'blue';
                return (
                  <tr key={a.id}>
                    <td><Badge tone={a.signed ? 'green' : 'grey'}>{CL[a.category] || a.category}</Badge>{a.signed && <span className="small muted"> firmato</span>}</td>
                    <td><div className="strong">{a.filename}</div><div className="small muted">{bytes(a.size)}{a.notes ? ` · ${a.notes}` : ''}</div></td>
                    <td>{itDate(a.issued_at)}</td>
                    <td>{exp ? <Badge tone={tone}>{itDate(exp)}</Badge> : <span className="muted">–</span>}</td>
                    <td className="small muted">{itDateTime(a.uploaded_at)}<br />{a.uploaded_by_name}</td>
                    <td className="num">
                      {['application/pdf', 'image/png', 'image/jpeg'].includes(a.mime) && <button className="btn sm ghost" onClick={() => setPreview({ url: `/api/resources/${id}/attachments/${a.id}/download?inline=1`, title: a.filename, mime: a.mime })}>Anteprima</button>}{' '}
                      <a className="btn sm ghost" href={`/api/resources/${id}/attachments/${a.id}/download`}>Scarica</a>{' '}
                      {writer && <button className="btn sm ghost" onClick={() => setModal({ editAtt: a })}>Modifica</button>}{' '}
                      {writer && <button className="iconbtn" onClick={() => setModal({ delAtt: a })}><Icon name="trash" /></button>}
                    </td>
                  </tr>);
              })}</tbody>
            </table></div>
          )}
        </Card>
      )}

      {tab === 'documenti' && (
        <Card title="Documenti generati dall'applicazione" flush actions={<span className="small muted">ogni generazione crea una nuova versione; i precedenti restano in archivio</span>}>
          {!documents.length ? <Empty>Nessun documento generato. Usa i pulsanti in alto per generare contratto, MBO o contratto LP sui format aziendali.</Empty> : (
            <div className="table-wrap"><table className="t">
              <thead><tr><th>Documento</th><th>Versione</th><th>Generato</th><th className="num">Azioni</th></tr></thead>
              <tbody>{documents.map((doc) => (
                <tr key={doc.id}>
                  <td><Badge tone="teal">{DOC_LABEL[doc.kind]}</Badge> <span className="strong">{doc.title}</span>{(doc.missing || []).length > 0 && <div className="small" style={{ color: '#9a5b00', marginTop: 4 }} title={doc.missing.join(', ')}>Con segnaposto da completare: {doc.missing.slice(0, 4).join(', ').toLowerCase()}{doc.missing.length > 4 ? ` e altri ${doc.missing.length - 4}` : ''}</div>}</td>
                  <td>v{doc.version}</td>
                  <td className="small muted">{itDateTime(doc.generated_at)}<br />{doc.generated_by_name}</td>
                  <td className="num">
                    {doc.has_pdf && <button className="btn sm ghost" onClick={() => setPreview({ url: `/api/documents/${doc.id}/download?format=pdf&inline=1`, title: doc.title, mime: 'application/pdf' })}>Anteprima</button>}{' '}
                    {doc.has_pdf && <a className="btn sm ghost" href={`/api/documents/${doc.id}/download?format=pdf`}>PDF</a>}{' '}
                    <a className="btn sm ghost" href={`/api/documents/${doc.id}/download?format=docx`}>DOCX</a>{' '}
                    {writer && <button className="btn sm" onClick={() => archive(doc)}>Archivia nel dossier</button>}{' '}
                    {isAdmin(user) && <button className="iconbtn" onClick={() => setModal({ delDoc: doc })}><Icon name="trash" /></button>}
                  </td>
                </tr>))}</tbody>
            </table></div>
          )}
        </Card>
      )}

      {tab === 'scadenze' && (
        <Card title="Scadenze della risorsa" actions={writer && <button className="btn sm" onClick={() => setModal('deadline')}>+ Scadenza manuale</button>} flush>
          {!deadlines.length ? <Empty>Nessuna scadenza calcolata o inserita</Empty> : (
            <table className="t"><thead><tr><th>Data</th><th>Scadenza</th><th>Tipo</th><th className="num">Stato</th></tr></thead>
              <tbody>{deadlines.map((x, i) => <tr key={i}><td>{itDate(x.due_date)}</td><td><div className="strong">{x.title}</div><div className="small muted">{x.detail}</div></td><td><Badge>{x.type}</Badge></td><td className="num"><Badge tone={DEADLINE_STATE[x.state]}>{x.days < 0 ? `scaduta da ${-x.days} gg` : `tra ${x.days} gg`}</Badge>{x.ref?.deadline_id && writer && <button className="btn sm link" style={{ marginLeft: 8 }} onClick={async () => { await api.put(`/resources/${id}/deadlines/${x.ref.deadline_id}`, { done: true }); d.reload(); }}>Fatto</button>}</td></tr>)}</tbody></table>
          )}
        </Card>
      )}

      {tab === 'lettere' && (
        <Card title="Lettere di impegno" flush actions={writer && isEmp && <Link className="btn sm" to="/scouting/lettere/nuova">+ Nuova lettera</Link>}>
          {!letters.length ? <Empty>Nessuna lettera di impegno</Empty> : (
            <table className="t"><thead><tr><th>Data</th><th>Proposta</th><th>Decorrenza max</th><th>Stato</th><th /></tr></thead>
              <tbody>{letters.map((l) => <tr key={l.id} className="click" onClick={() => nav(`/scouting/lettere/${l.id}`)}><td>{itDate(l.letter_date)}</td><td>{l.job_title} · {LEVEL_LABEL[l.level] || l.level}{costs ? ` · ${eur(l.ral)}` : ''}</td><td>{itDate(l.start_by)}</td><td><Badge tone={LETTER_STATUS[l.status]?.tone}>{LETTER_STATUS[l.status]?.label}</Badge></td><td className="num"><Icon name="arrow" /></td></tr>)}</tbody></table>
          )}
        </Card>
      )}

      {modal === 'person' && <EditPerson r={r} onClose={() => setModal(null)} onSaved={() => { setModal(null); d.reload(); }} />}
      {modal === 'employment' && <EditEmployment id={id} e={e} onClose={() => setModal(null)} onSaved={() => { setModal(null); d.reload(); }} />}
      {modal === 'lp' && <EditLp id={id} lp={lp} onClose={() => setModal(null)} onSaved={() => { setModal(null); d.reload(); }} />}
      {modal === 'upload' && <UploadModal id={id} cats={cats} onClose={() => setModal(null)} onSaved={() => { setModal(null); d.reload(); }} />}
      {modal?.editAtt && <EditAttachment id={id} a={modal.editAtt} cats={cats} onClose={() => setModal(null)} onSaved={() => { setModal(null); d.reload(); }} />}
      {modal?.delAtt && <ConfirmModal danger title="Elimina allegato" text={`Eliminare "${modal.delAtt.filename}" dal dossier? L'operazione è definitiva.`} confirmText="Elimina" onClose={() => setModal(null)} onConfirm={async () => { await api.del(`/resources/${id}/attachments/${modal.delAtt.id}`); d.reload(); }} />}
      {modal?.delDoc && <ConfirmModal danger title="Elimina documento generato" text={`Eliminare "${modal.delDoc.title}" v${modal.delDoc.version}?`} confirmText="Elimina" onClose={() => setModal(null)} onConfirm={async () => { await api.del(`/documents/${modal.delDoc.id}`); d.reload(); }} />}
      {modal === 'deadline' && <DeadlineModal id={id} onClose={() => setModal(null)} onSaved={() => { setModal(null); d.reload(); }} />}
      {modal === 'cessa' && <PromptModal danger title="Registra cessazione" label="Motivazione / note" confirmText="Registra cessazione" onClose={() => setModal(null)} onConfirm={async (reason) => { await api.put(`/resources/${id}`, { status: 'CESSATO', terminated_at: new Date().toISOString().slice(0, 10), notes: `${r.notes ? `${r.notes}\n` : ''}Cessazione ${itDate(new Date().toISOString())}: ${reason}` }); d.reload(); }} />}
      {modal === 'delete' && <PromptModal danger title="Elimina risorsa" label="Motivazione (tracciata nel registro)" confirmText="Elimina definitivamente" onClose={() => setModal(null)} onConfirm={async (reason) => { await api.del(`/resources/${id}`, { reason }); nav('/risorse'); }} />}
      {preview && (
        <Modal title={preview.title} onClose={() => setPreview(null)} wide>
          {preview.mime === 'application/pdf' ? <iframe title={preview.title} src={preview.url} style={{ width: '100%', height: '70vh', border: 0 }} /> : <img src={preview.url} alt={preview.title} style={{ maxWidth: '100%' }} />}
        </Modal>
      )}
    </div>
  );
}

function EditPerson({ r, onClose, onSaved }) {
  const [v, setV] = useState({ ...r, birth_date: r.birth_date ? String(r.birth_date).slice(0, 10) : '', hired_at: r.hired_at ? String(r.hired_at).slice(0, 10) : '' });
  const [err, setErr] = useState(null);
  const save = async () => {
    setErr(null);
    const keys = ['last_name', 'first_name', 'sex', 'title', 'birth_place', 'birth_date', 'tax_code', 'vat_number', 'phone', 'email', 'address', 'zip', 'city', 'province', 'area_id', 'manager_id', 'notes', 'hired_at'];
    const body = Object.fromEntries(keys.map((k) => [k, v[k] === '' ? null : v[k]]));
    try { await api.put(`/resources/${r.id}`, body); onSaved(); } catch (e) { setErr(e); }
  };
  return <Modal title="Modifica anagrafica" onClose={onClose} wide footer={<><button className="btn ghost" onClick={onClose}>Annulla</button><button className="btn" onClick={save}>Salva</button></>}><ErrorBox error={err} /><PersonForm value={v} onChange={setV} kind={r.kind} /><div className="form-grid" style={{ marginTop: 12 }}><Field label="Data di ingresso"><input type="date" value={v.hired_at || ''} onChange={(e) => setV({ ...v, hired_at: e.target.value })} /></Field></div></Modal>;
}

function EditEmployment({ id, e, onClose, onSaved }) {
  const sites = useApi('/work-sites');
  const [v, setV] = useState(e ? { ...e, start_date: e.start_date ? String(e.start_date).slice(0, 10) : '', end_date: e.end_date ? String(e.end_date).slice(0, 10) : '', letter_date: e.letter_date ? String(e.letter_date).slice(0, 10) : '', probation_end: e.probation_end ? String(e.probation_end).slice(0, 10) : '' } : { contract_type: 'TIND', weekly_hours: 40, weekly_days: 5, days_label: 'dal lunedì al venerdì', monthly_payments: 14, probation: 'Nessuno.', autonomous_hours: true, benefits: [], ral_steps: [], mbo_objectives: [] });
  const [err, setErr] = useState(null);
  const save = async () => {
    setErr(null);
    const body = { ...v };
    delete body.resource_id; delete body.updated_at;
    for (const k of Object.keys(body)) if (body[k] === '') body[k] = null;
    body.benefits = (body.benefits || []).filter(Boolean); body.ral_steps = (body.ral_steps || []).filter((s) => s.from && s.ral); body.mbo_objectives = (body.mbo_objectives || []).filter((o) => o.area || o.objective);
    try { await api.put(`/resources/${id}/employment`, body); onSaved(); } catch (e2) { setErr(e2); }
  };
  return <Modal title="Rapporto di lavoro" onClose={onClose} wide footer={<><button className="btn ghost" onClick={onClose}>Annulla</button><button className="btn" onClick={save}>Salva</button></>}><ErrorBox error={err} /><EmploymentForm value={v} onChange={setV} sites={sites.data || []} /><div className="form-grid" style={{ marginTop: 12 }}><Field label="Data della lettera"><input type="date" value={v.letter_date || ''} onChange={(ev) => setV({ ...v, letter_date: ev.target.value })} /></Field><Field label="Coefficiente costo (override)" help="Vuoto = calcolato dalle impostazioni"><input type="number" step="0.0001" value={v.cost_coefficient ?? ''} onChange={(ev) => setV({ ...v, cost_coefficient: ev.target.value === '' ? null : Number(ev.target.value) })} /></Field></div></Modal>;
}

function EditLp({ id, lp, onClose, onSaved }) {
  const [v, setV] = useState(lp ? { ...lp, start_date: lp.start_date ? String(lp.start_date).slice(0, 10) : '', end_date: lp.end_date ? String(lp.end_date).slice(0, 10) : '', order_since: lp.order_since ? String(lp.order_since).slice(0, 10) : '', insurance_expiry: lp.insurance_expiry ? String(lp.insurance_expiry).slice(0, 10) : '', letter_date: lp.letter_date ? String(lp.letter_date).slice(0, 10) : '' } : { fees: [], degrees: [], activities: [], auto_renew: true, notice_days: 30, insurance_required: 1000000 });
  const [err, setErr] = useState(null);
  const save = async () => {
    setErr(null);
    const body = { ...v }; delete body.resource_id; delete body.updated_at;
    for (const k of Object.keys(body)) if (body[k] === '') body[k] = null;
    body.fees = (body.fees || []).filter((f) => f.description); body.degrees = (body.degrees || []).filter(Boolean); body.activities = (body.activities || []).filter(Boolean);
    try { await api.put(`/resources/${id}/lp`, body); onSaved(); } catch (e2) { setErr(e2); }
  };
  return <Modal title="Incarico professionale" onClose={onClose} wide footer={<><button className="btn ghost" onClick={onClose}>Annulla</button><button className="btn" onClick={save}>Salva</button></>}><ErrorBox error={err} /><LpForm value={v} onChange={setV} /><div className="form-grid" style={{ marginTop: 12 }}><Field label="Data del contratto"><input type="date" value={v.letter_date || ''} onChange={(ev) => setV({ ...v, letter_date: ev.target.value })} /></Field></div></Modal>;
}

function UploadModal({ id, cats, onClose, onSaved }) {
  const [f, setF] = useState({ category: cats[0]?.value || 'ALTRO', issued_at: '', expires_at: '', signed: false, notes: '' });
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!files.length) return setErr(new Error('Seleziona almeno un file'));
    setBusy(true); setErr(null);
    try {
      for (const file of files) { const fd = new FormData(); fd.append('file', file); for (const [k, v] of Object.entries(f)) fd.append(k, v); await api.upload(`/resources/${id}/attachments`, fd); }
      onSaved();
    } catch (e) { setErr(e); }
    setBusy(false);
  };
  return <Modal title="Carica allegato nel dossier" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Annulla</button><button className="btn" disabled={busy} onClick={save}>{busy ? 'Caricamento…' : 'Carica'}</button></>}>
    <ErrorBox error={err} />
    <div className="form-grid">
      <Field label="File (PDF, immagini, Office, zip)" className="span2"><input type="file" multiple onChange={(e) => setFiles([...e.target.files])} /></Field>
      <Field label="Categoria"><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{cats.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
      <Field label="Firmato" className="inline"><input type="checkbox" checked={f.signed} onChange={(e) => setF({ ...f, signed: e.target.checked })} /> documento sottoscritto</Field>
      <Field label="Data rilascio"><input type="date" value={f.issued_at} onChange={(e) => setF({ ...f, issued_at: e.target.value })} /></Field>
      <Field label="Scadenza" help="Alimenta il calendario delle scadenze"><input type="date" value={f.expires_at} onChange={(e) => setF({ ...f, expires_at: e.target.value })} /></Field>
      <Field label="Note" className="span2"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </div>
  </Modal>;
}

function EditAttachment({ id, a, cats, onClose, onSaved }) {
  const [f, setF] = useState({ category: a.category, issued_at: a.issued_at ? String(a.issued_at).slice(0, 10) : '', expires_at: a.expires_at ? String(a.expires_at).slice(0, 10) : '', signed: a.signed, notes: a.notes || '' });
  const [err, setErr] = useState(null);
  const save = async () => { try { await api.put(`/resources/${id}/attachments/${a.id}`, { ...f, issued_at: f.issued_at || null, expires_at: f.expires_at || null }); onSaved(); } catch (e) { setErr(e); } };
  return <Modal title={a.filename} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Annulla</button><button className="btn" onClick={save}>Salva</button></>}>
    <ErrorBox error={err} />
    <div className="form-grid">
      <Field label="Categoria"><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{cats.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Field>
      <Field label="Firmato" className="inline"><input type="checkbox" checked={f.signed} onChange={(e) => setF({ ...f, signed: e.target.checked })} /> documento sottoscritto</Field>
      <Field label="Data rilascio"><input type="date" value={f.issued_at} onChange={(e) => setF({ ...f, issued_at: e.target.value })} /></Field>
      <Field label="Scadenza"><input type="date" value={f.expires_at} onChange={(e) => setF({ ...f, expires_at: e.target.value })} /></Field>
      <Field label="Note" className="span2"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </div>
  </Modal>;
}

function DeadlineModal({ id, onClose, onSaved }) {
  const [f, setF] = useState({ title: '', due_date: '', notes: '' });
  const [err, setErr] = useState(null);
  const save = async () => { try { await api.post(`/resources/${id}/deadlines`, f); onSaved(); } catch (e) { setErr(e); } };
  return <Modal title="Nuova scadenza" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Annulla</button><button className="btn" onClick={save}>Salva</button></>}>
    <ErrorBox error={err} />
    <div className="form-grid"><Field label="Titolo" className="span2"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field><Field label="Data"><input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field><Field label="Note" className="span2"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field></div>
  </Modal>;
}
