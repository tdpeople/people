// Costruzione dei dati per i template documentali
import { itDate, r2 } from './util.js';
import { decompose } from './payroll.js';

export const eurIt = (n) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }).format(Number(n || 0));
const dateLong = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const LEVEL_LABEL = { Q: 'Quadro', 1: '1° livello', 2: '2° livello', '3S': '3° livello Super', 3: '3° livello', '4S': '4° livello Super', 4: '4° livello', 5: '5° livello' };

export const fullName = (r) => `${r.first_name} ${r.last_name}`.trim();
const female = (r) => r.sex === 'F';
const g = (r, f, m) => (female(r) ? f : m);

function workHoursClause(r, autonomous) {
  if (!autonomous) return '';
  return ` Le precisiamo che, ai sensi del D.Lgs. 66/2003, in virtù degli incarichi professionali a Lei attribuiti, che comportano determinazione autonoma del Suo tempo di lavoro, Lei non è ${g(r, 'soggetta', 'soggetto')} ai limiti massimi dell’orario di lavoro.`;
}

function ralStepsSentence(steps) {
  const s = (steps || []).filter((x) => x.from && Number(x.ral) > 0).sort((a, b) => a.from.localeCompare(b.from));
  return s;
}

export function contractData({ resource: r, employment: e, settings: S, letterDate }) {
  const monthly = Number(e.monthly_payments || 14);
  const dec = decompose(e.ral, monthly, e.base_pay, Number(S.function_allowance_share || 0.7));
  const basePay = e.base_pay != null ? Number(e.base_pay) : dec.base_pay;
  const superminimo = e.superminimo != null ? Number(e.superminimo) : dec.superminimo;
  const allowance = e.function_allowance != null ? Number(e.function_allowance) : dec.function_allowance;
  const voci = [{ label: 'Paga Base', importo: eurIt(basePay) }];
  if (superminimo > 0) voci.push({ label: e.superminimo_absorbable ? 'Superminimo assorbibile' : 'Superminimo non assorbibile', importo: eurIt(superminimo) });
  if (allowance > 0) voci.push({ label: 'Indennità di funzione', importo: eurIt(allowance) });
  const partTime = Number(e.weekly_hours) < 40;
  const benefits = (e.benefits || []).filter(Boolean).map((b) => String(b).replace(/[;.]\s*$/, '') + ';');
  if (benefits.length) benefits[benefits.length - 1] = benefits[benefits.length - 1].replace(/;$/, '.');
  const hasProbation = e.probation && !/^nessun/i.test(e.probation.trim());
  return {
    nome_completo: fullName(r),
    indirizzo: r.address || 'SEDE',
    cap_citta: [r.zip, r.city, r.province ? `(${r.province})` : ''].filter(Boolean).join(' '),
    nato_a: g(r, 'Nata a', 'Nato a'),
    luogo_nascita: r.birth_place || '',
    data_nascita: itDate(r.birth_date),
    cf: r.tax_code || '',
    tipo_contratto: e.contract_type === 'TDET' ? 'determinato' : 'indeterminato',
    regime_orario: partTime ? 'part-time' : 'full-time',
    regime_frase: partTime ? ' full time, riproporzionata per il numero di ore contrattualizzate,' : '',
    prova_premessa: hasProbation ? ', previo superamento del periodo di prova sotto riportato per le mansioni di seguito indicate,' : '',
    citta_lettera: S.letter_city || 'Firenze',
    data_lettera: itDate(letterDate || e.letter_date || new Date().toISOString().slice(0, 10)),
    data_assunzione: itDate(e.start_date),
    inquadrato: g(r, 'inquadrata', 'inquadrato'),
    livello: e.level === 'Q' ? 'Quadro' : (e.level || ''),
    mansione: e.job_title || '',
    ore_settimanali: String(Number(e.weekly_hours || 40)).replace('.', ','),
    giorni_settimanali: String(e.weekly_days || 5),
    giorni_label: e.days_label || 'dal lunedì al venerdì',
    clausola_orario: workHoursClause(r, e.autonomous_hours),
    ral: eurIt(e.ral),
    mensilita: String(monthly),
    ral_mensile: eurIt(dec.ral_monthly),
    composta_intro: ', e sarà così composta:',
    voci,
    scatti: ralStepsSentence(e.ral_steps).map((s) => ({ dal: itDate(s.from), ral: eurIt(s.ral) })),
    mbo: e.mbo_enabled ? [{ mbo_pct: String(Number(e.mbo_pct || 0)).replace('.', ',') }] : [],
    periodo_prova: e.probation || 'Nessuno.',
    sede_lavoro: e.work_site || S.company_address,
    has_benefits: benefits.length > 0,
    benefits,
  };
}

export function mboData({ resource: r, employment: e, settings: S, letterDate }) {
  const year = e.mbo_year || new Date().getFullYear();
  const objectives = (e.mbo_objectives || []).map((o) => ({ area: o.area || '', obiettivo: o.objective || '', kpi: o.kpi || '', target: o.target || '', peso: String(o.weight ?? '') }));
  return {
    nome_completo: fullName(r),
    firmatario: S.signatory_name || '',
    destinatari_label: e.mbo_label || 'Top Management',
    anno: String(year),
    anno_succ: String(year + 1),
    mbo_pct: String(Number(e.mbo_pct || 0)).replace('.', ','),
    luogo_data: `${S.letter_city || 'Firenze'} (FI), ${itDate(letterDate || e.letter_date || new Date().toISOString().slice(0, 10))}`,
    obiettivi: objectives,
  };
}

export function commitmentData({ resource: r, letter: l, settings: S }) {
  const steps = ralStepsSentence(l.ral_steps);
  let ralScatti = '';
  if (steps.length) {
    const first = steps[0];
    const dayBefore = new Date(`${first.from}T12:00:00`); dayBefore.setDate(dayBefore.getDate() - 1);
    ralScatti = ` fino al ${itDate(dayBefore.toISOString().slice(0, 10))}`;
    steps.forEach((s) => { ralScatti += `. A decorrere dal ${itDate(s.from)}, la Sua retribuzione lorda annua sarà di euro ${eurIt(s.ral)}`; });
  }
  const level = String(l.level || '');
  return {
    nome_completo: fullName(r),
    firmatario: S.signatory_name || '',
    tipo_contratto: l.contract_type === 'TDET' ? 'determinato' : 'indeterminato',
    data_inizio_max: dateLong(l.start_by),
    sede_lavoro: l.work_site || S.company_address,
    assunto: g(r, 'assunta', 'assunto'),
    qualifica: l.qualification || (level === 'Q' ? 'Quadro' : 'Impiegato'),
    livello_label: LEVEL_LABEL[level] || level,
    mansione: l.job_title || '',
    orario_frase: Number(l.weekly_hours) < 40 ? 'un part-time' : 'quello contrattualmente previsto per i lavoratori a tempo pieno',
    ore_settimanali: String(Number(l.weekly_hours || 40)).replace('.', ','),
    clausola_orario: workHoursClause(r, l.autonomous_hours),
    ral: eurIt(l.ral),
    ral_scatti: ralScatti,
    mbo_frase: l.mbo_enabled ? ` Per lo specifico ruolo Le potrà essere riconosciuto un premio per obiettivi (MBO) fino al ${String(Number(l.mbo_pct || 0)).replace('.', ',')}% della RAL, disciplinato da specifico accordo annuale.` : '',
    inviata: g(r, 'inviata', 'inviato'),
    validita: dateLong(l.valid_until),
    luogo_data: `${S.letter_city || 'Firenze'} (FI), ${itDate(l.letter_date)}`,
  };
}

const FEE_UNIT = { FISSO: '/mese', ORARIO: '/ora', PRESTAZIONE: '/cad', VARIABILE: '' };
export function feeLabel(f) {
  if (f.type === 'VARIABILE') return `${String(Number(f.amount || 0)).replace('.', ',')}%`;
  const unit = f.unit ? `/${f.unit}` : (FEE_UNIT[f.type] || '');
  return `€ ${eurIt(f.amount)}${unit}`;
}

export function lpData({ resource: r, lp, settings: S, letterDate }) {
  const title = (r.title || (female(r) ? 'dott.ssa' : 'dott.')).trim();
  const art = female(r) ? 'la' : 'il';
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const residenza = [r.city, r.province ? `(${r.province})` : '', r.address ? `, ${r.address}` : ''].filter(Boolean).join(' ').replace(' ,', ',');
  const ordine = [lp.order_name, lp.order_province ? `di ${lp.order_province}` : ''].filter(Boolean).join(' ');
  const date = letterDate || lp.letter_date || new Date().toISOString().slice(0, 10);
  return {
    art_titolo: `${art} ${title}`,
    Art_titolo: `${cap(art)} ${title}`,
    Titolo: cap(title),
    Il_sottoscritto: female(r) ? 'La sottoscritta' : 'Il sottoscritto',
    nome_completo: fullName(r),
    firmatario: S.signatory_name || '',
    luogo_data: `${S.letter_city || 'Firenze'} (FI), ${itDate(date)}`,
    citta: S.letter_city || 'Firenze',
    data_lettera: itDate(date),
    data_stipula: itDate(lp.start_date || date),
    sede_legale: S.company_legal_address || S.company_address,
    nato: g(r, 'nata', 'nato'),
    domiciliato: g(r, 'domiciliata', 'domiciliato'),
    data_nascita: itDate(r.birth_date),
    luogo_nascita: r.birth_place || '',
    residenza,
    cf: r.tax_code || '',
    piva: r.vat_number || '',
    titoli: (lp.degrees || []).filter(Boolean).map((t) => String(t).replace(/;?$/, ';')),
    ordine: ordine || 'Ordine professionale',
    ordine_numero: lp.order_number || '',
    ordine_dal: itDate(lp.order_since),
    oggetto_prestazione: lp.role_description || `la consulenza sanitaria negli ambiti per cui il Professionista è abilitato`,
    attivita: (lp.activities || []).filter(Boolean),
    data_inizio: itDate(lp.start_date),
    data_fine: itDate(lp.end_date),
    preavviso: `${lp.notice_days || 30} (${numberWords(lp.notice_days || 30)})`,
    massimale: `${eurIt(lp.insurance_required || 1000000)}`,
    tariffe: (lp.fees || []).map((f) => ({ codice: f.code || '-', descrizione: f.description || '', categoria: f.category || '', tariffa: feeLabel(f), note: f.notes || '-' })),
  };
}

function numberWords(n) {
  const w = { 15: 'quindici', 30: 'trenta', 45: 'quarantacinque', 60: 'sessanta', 90: 'novanta', 120: 'centoventi', 180: 'centottanta' };
  return w[n] || String(n);
}

export const money = r2;
