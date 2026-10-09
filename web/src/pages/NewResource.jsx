import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApi, Card, Field, ErrorBox, useToast, Badge, Icon } from '../components/ui.jsx';
import { PersonForm, EmploymentForm, LpForm } from '../components/forms.jsx';
import { eur, itDate, LEVEL_LABEL, today } from '../format.js';

const STEPS_EMP = ['Tipo di risorsa', 'Percorso', 'Anagrafica e CV', 'Dati contrattuali', 'Riepilogo e generazione'];
const STEPS_LP = ['Tipo di risorsa', 'Anagrafica e CV', 'Dati dell\'incarico', 'Riepilogo e generazione'];

function Steps({ steps, cur }) {
  return <div className="steps">{steps.map((s, i) => <div key={s} className={`s ${i < cur ? 'done' : i === cur ? 'now' : ''}`}><i>{i < cur ? '✓' : i + 1}</i>{s}</div>)}</div>;
}

export default function NewResource({ letterMode = false }) {
  const nav = useNavigate();
  const toast = useToast();
  const [sp] = useSearchParams();
  const [kind, setKind] = useState(sp.get('kind') || (letterMode ? 'DIPENDENTE' : ''));
  const [path, setPath] = useState(letterMode ? 'LETTERA' : sp.get('kind') === 'DIPENDENTE' ? '' : '');
  const [step, setStep] = useState(kind ? 1 : 0);
  const [person, setPerson] = useState({ kind: kind || 'DIPENDENTE' });
  const [emp, setEmp] = useState({ contract_type: 'TIND', weekly_hours: 40, weekly_days: 5, days_label: 'dal lunedì al venerdì', monthly_payments: 14, probation: 'Nessuno.', autonomous_hours: true, benefits: [], ral_steps: [], mbo_objectives: [], mbo_enabled: false, work_site: 'via di Pratignone, 13/4, 50019 Sesto Fiorentino (FI)' });
  const [letter, setLetter] = useState({ contract_type: 'TIND', weekly_hours: 40, autonomous_hours: true, ral_steps: [], letter_date: today(), work_site: 'Via di Pratignone, 13/4, 50019 Sesto Fiorentino (FI)' });
  const [lp, setLp] = useState({ fees: [], degrees: [], activities: [], auto_renew: true, notice_days: 30, insurance_required: 1000000, role_description: '' });
  const [cvFile, setCvFile] = useState(null);
  const [fromLetter, setFromLetter] = useState(null); // lettera accettata selezionata
  const [generate, setGenerate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const accepted = useApi(kind === 'DIPENDENTE' && path === 'CONTRATTO' ? '/scouting/letters-accepted' : null, [kind, path]);
  const sites = useApi('/work-sites');
  const cvId = sp.get('cv_id');
  const cv = useApi(cvId ? `/scouting/cv?q=` : null);
  useEffect(() => {
    if (!cvId || !cv.data) return;
    const c = cv.data.find((x) => String(x.id) === cvId);
    if (c) setPerson((p) => ({ ...p, last_name: c.last_name || '', first_name: c.first_name || '', email: c.email || '', phone: c.phone || '', area_id: c.area_id || null }));
  }, [cvId, cv.data]);

  const isLp = kind === 'LP';
  const steps = isLp ? STEPS_LP : STEPS_EMP;
  const idx = (name) => steps.indexOf(name);

  const pickKind = (k) => { setKind(k); setPerson((p) => ({ ...p, kind: k })); setStep(1); if (k === 'LP') setPath('LP'); };
  const pickPath = (p) => { setPath(p); setStep(2); };
  const useLetter = (l) => {
    setFromLetter(l);
    setPerson((p) => ({ ...p, id: l.resource_id, last_name: l.last_name, first_name: l.first_name, tax_code: l.tax_code || '', email: l.email || '', phone: l.phone || '', area_id: l.area_id || null, manager_id: l.manager_id || null, birth_place: l.birth_place || '', birth_date: l.birth_date ? String(l.birth_date).slice(0, 10) : '', sex: l.sex || '' }));
    setEmp((e) => ({ ...e, contract_type: l.contract_type || 'TIND', level: l.level || '', qualification: l.qualification || '', job_title: l.job_title || '', weekly_hours: Number(l.weekly_hours || 40), autonomous_hours: Boolean(l.autonomous_hours), ral: Number(l.ral || 0), ral_steps: l.ral_steps || [], mbo_enabled: Boolean(l.mbo_enabled), mbo_pct: l.mbo_pct, work_site: l.work_site || e.work_site, start_date: l.start_by ? String(l.start_by).slice(0, 10) : '' }));
    setStep(2);
  };

  const clean = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : v]));

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      let resourceId; let target;
      if (isLp) {
        const r = await api.post('/resources', { person: clean({ ...person, kind: 'LP', status: 'ATTIVO' }), lp: { ...lp, fees: (lp.fees || []).filter((f) => f.description), degrees: (lp.degrees || []).filter(Boolean), activities: (lp.activities || []).filter(Boolean) } });
        resourceId = r.id; target = `/risorse/${resourceId}`;
        if (cvFile) await uploadCv(resourceId);
        if (generate) await api.post(`/resources/${resourceId}/documents/generate`, { kind: 'CONTRATTO_LP' });
      } else if (path === 'LETTERA') {
        const r = await api.post('/scouting/letters', { person: fromLetter?.id ? undefined : clean({ ...person, kind: 'DIPENDENTE', status: 'IMPEGNO' }), resource_id: person.id || undefined, cv_id: cvId || undefined, letter: { ...letter, ral_steps: (letter.ral_steps || []).filter((s) => s.from && s.ral) }, generate });
        resourceId = r.resource_id; target = `/scouting/lettere/${r.id}`;
        if (cvFile) await uploadCv(resourceId);
      } else {
        const e = { ...emp, benefits: (emp.benefits || []).filter(Boolean), ral_steps: (emp.ral_steps || []).filter((s) => s.from && s.ral), mbo_objectives: emp.mbo_enabled ? (emp.mbo_objectives || []).filter((o) => o.area || o.objective) : [] };
        if (fromLetter?.id) {
          resourceId = fromLetter.resource_id;
          await api.put(`/resources/${resourceId}`, clean({ ...person, id: undefined, kind: 'DIPENDENTE', status: 'ATTIVO', hired_at: emp.start_date || null }));
          await api.put(`/resources/${resourceId}/employment`, e);
          await api.put(`/scouting/letters/${fromLetter.id}`, { status: 'CONVERTITA' });
        } else {
          const r = await api.post('/resources', { person: clean({ ...person, kind: 'DIPENDENTE', status: 'ATTIVO' }), employment: e });
          resourceId = r.id;
        }
        target = `/risorse/${resourceId}`;
        if (cvFile) await uploadCv(resourceId);
        if (generate) {
          if (emp.contract_type !== 'DIRIGENTE') await api.post(`/resources/${resourceId}/documents/generate`, { kind: 'CONTRATTO' });
          if (emp.mbo_enabled) await api.post(`/resources/${resourceId}/documents/generate`, { kind: 'MBO' });
        }
      }
      toast('Risorsa salvata' + (generate ? ' e documenti generati' : ''));
      nav(target);
    } catch (e2) { setErr(e2); }
    setBusy(false);
  };
  const uploadCv = async (id) => { const fd = new FormData(); fd.append('file', cvFile); fd.append('category', 'CV'); fd.append('set_cv', 'true'); await api.upload(`/resources/${id}/attachments`, fd); };

  const personOk = person.last_name && person.first_name;
  const dataOk = isLp ? Boolean(lp.discipline) : path === 'LETTERA' ? Boolean(letter.job_title && letter.ral) : Boolean(emp.job_title && emp.ral && emp.start_date);

  return (
    <div className="page">
      <div className="page-head"><div><h1>{letterMode ? 'Nuova lettera di impegno' : 'Inserimento nuova risorsa'}</h1><div className="sub">Il percorso guida raccoglie i dati e genera i documenti sui format aziendali (DOCX e PDF).</div></div></div>
      <Steps steps={steps} cur={step} />
      <ErrorBox error={err} />

      {step === 0 && (
        <div className="grid g2">
          <Card title="Dipendente"><p>Rapporto di lavoro subordinato con CCNL Studi Professionali: lettera di impegno all'assunzione o contratto di assunzione (con eventuale piano MBO).</p><button className="btn" onClick={() => pickKind('DIPENDENTE')}>Dipendente <Icon name="arrow" /></button></Card>
          <Card title="Libero professionista"><p>Incarico di prestazione professionale con tariffario, iscrizione all'ordine e polizza RC: contratto generato dal format LP.</p><button className="btn" onClick={() => pickKind('LP')}>Libero professionista <Icon name="arrow" /></button></Card>
        </div>
      )}

      {!isLp && step === 1 && (
        <div className="grid g2">
          <Card title="Lettera di impegno all'assunzione"><p>Proposta formale con livello, mansione, RAL e decorrenza massima. La risorsa entra in stato "in impegno"; all'accettazione i dati passano al contratto senza reinserimento.</p><button className="btn" onClick={() => pickPath('LETTERA')}>Lettera di impegno <Icon name="arrow" /></button></Card>
          <Card title="Contratto di assunzione"><p>Lettera di assunzione a tempo indeterminato/determinato o apprendistato. Se esiste una lettera di impegno accettata, i dati vengono recuperati.</p><button className="btn" onClick={() => pickPath('CONTRATTO')}>Contratto di assunzione <Icon name="arrow" /></button></Card>
        </div>
      )}

      {!isLp && step === 2 && path === 'CONTRATTO' && !fromLetter && (accepted.data || []).length > 0 && (
        <Card title="Lettere di impegno accettate" className="no-print" actions={<span className="small muted">verifica automatica</span>}>
          <p>Ci sono lettere di impegno accettate non ancora convertite in assunzione. Seleziona quella della persona da assumere per recuperare tutti i dati, oppure prosegui con un inserimento nuovo.</p>
          <div className="table-wrap"><table className="t"><thead><tr><th>Persona</th><th>Mansione</th><th>Livello</th><th className="num">RAL</th><th>Decorrenza max</th><th /></tr></thead>
            <tbody>{accepted.data.map((l) => <tr key={l.id}><td className="strong">{l.last_name} {l.first_name}</td><td>{l.job_title}</td><td>{LEVEL_LABEL[l.level] || l.level}</td><td className="num">{eur(l.ral)}</td><td>{itDate(l.start_by)}</td><td className="num"><button className="btn sm" onClick={() => useLetter(l)}>Recupera i dati</button></td></tr>)}</tbody></table></div>
          <div style={{ marginTop: 12 }}><button className="btn ghost" onClick={() => setFromLetter({ none: true })}>Prosegui senza lettera</button></div>
        </Card>
      )}

      {((isLp && step === 1) || (!isLp && step === 2 && (path === 'LETTERA' || fromLetter || !(accepted.data || []).length))) && (
        <Card title="Anagrafica e CV">
          {fromLetter?.id && <div className="alert ok" style={{ marginBottom: 12 }}>Dati recuperati dalla lettera di impegno del {itDate(fromLetter.letter_date)} (accettata il {itDate(fromLetter.accepted_at)}).</div>}
          <PersonForm value={person} onChange={setPerson} kind={kind} />
          <div className="form-grid" style={{ marginTop: 12 }}>
            <Field label="CV in PDF" help="Va nel dossier della risorsa"><input type="file" accept="application/pdf" onChange={(e) => setCvFile(e.target.files?.[0] || null)} /></Field>
          </div>
          <div className="row end" style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => setStep(step - 1)}>Indietro</button><button className="btn" disabled={!personOk} onClick={() => setStep(step + 1)}>Avanti</button></div>
        </Card>
      )}

      {((isLp && step === 2) || (!isLp && step === 3)) && (
        <Card title={isLp ? 'Dati dell\'incarico' : path === 'LETTERA' ? 'Condizioni proposte' : 'Dati contrattuali'}>
          {isLp ? <LpForm value={lp} onChange={setLp} /> : path === 'LETTERA' ? <EmploymentForm value={letter} onChange={setLetter} letter sites={sites.data || []} /> : <EmploymentForm value={emp} onChange={setEmp} sites={sites.data || []} />}
          <div className="row end" style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => setStep(step - 1)}>Indietro</button><button className="btn" disabled={!dataOk} onClick={() => setStep(step + 1)}>Avanti</button></div>
        </Card>
      )}

      {((isLp && step === 3) || (!isLp && step === 4)) && (
        <Card title="Riepilogo">
          <div className="grid g2">
            <div>
              <h3>Persona</h3>
              <p><b>{person.last_name} {person.first_name}</b> {person.sex && <Badge>{person.sex === 'F' ? 'Donna' : 'Uomo'}</Badge>}<br />{person.birth_place} {person.birth_date ? itDate(person.birth_date) : ''}<br />{person.tax_code}<br />{person.email} {person.phone}</p>
            </div>
            <div>
              <h3>{isLp ? 'Incarico' : path === 'LETTERA' ? 'Proposta' : 'Contratto'}</h3>
              {isLp ? <p>{lp.discipline}<br />dal {itDate(lp.start_date)} al {itDate(lp.end_date)}<br />{(lp.fees || []).filter((f) => f.description).length} voci di compenso</p>
                : path === 'LETTERA' ? <p>{letter.job_title} · {LEVEL_LABEL[letter.level] || letter.level}<br />RAL {eur(letter.ral)}{(letter.ral_steps || []).filter((s) => s.from).map((s) => ` → ${eur(s.ral)} dal ${itDate(s.from)}`)}<br />decorrenza non oltre il {itDate(letter.start_by)}</p>
                  : <p>{emp.job_title} · {LEVEL_LABEL[emp.level] || emp.level}<br />RAL {eur(emp.ral)} su {emp.monthly_payments} mensilità{(emp.ral_steps || []).filter((s) => s.from).map((s) => ` → ${eur(s.ral)} dal ${itDate(s.from)}`)}<br />dal {itDate(emp.start_date)} · {emp.weekly_hours} ore · prova: {emp.probation}{emp.mbo_enabled ? ` · MBO ${emp.mbo_pct}%` : ''}</p>}
            </div>
          </div>
          <label className="f inline" style={{ marginTop: 10 }}><input type="checkbox" checked={generate} onChange={(e) => setGenerate(e.target.checked)} /> Genera subito i documenti (DOCX e PDF) sui format aziendali{!isLp && path === 'CONTRATTO' && emp.mbo_enabled ? ': contratto e piano MBO' : ''}</label>
          <div className="row end" style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => setStep(step - 1)}>Indietro</button><button className="btn lg" disabled={busy} onClick={save}>{busy ? 'Salvataggio…' : 'Salva e genera'}</button></div>
        </Card>
      )}
    </div>
  );
}
