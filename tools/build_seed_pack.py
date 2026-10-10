"""Costruisce il pacchetto iniziale (seed-pack.zip) dai contratti e allegati della cartella HRM.

Uso: python3 tools/build_seed_pack.py <cartella HRM> <file zip di uscita>
Il pacchetto contiene manifest.json e files/<chiave>/<nome file>; si importa da Impostazioni > Importa pacchetto.
"""
import json
import os
import re
import sys
import zipfile

HRM, OUT = sys.argv[1], sys.argv[2]
D = os.path.join(HRM, 'Dipendenti')
LPD = os.path.join(HRM, 'LP', 'LP Attivi', 'contratti e documentazione LP')

PRATIGNONE = 'via di Pratignone, 13/4, 50019 Sesto Fiorentino (FI)'
BELFIORE = 'viale Belfiore, 55, 50144 Firenze (FI)'
LIVORNO = 'Via Aurelio Lampredi, 3, 57121 Livorno (LI)'
CLAUSE = True
MBO_STD = [
    {'area': 'Performance Economica', 'objective': 'Raggiungimento del risultato del Piano Industriale', 'kpi': 'Fatturato annuo lordo', 'target': 'Delta', 'weight': 25},
    {'area': 'Performance Economica', 'objective': 'Raggiungimento del risultato del Piano Industriale', 'kpi': 'EBITDA / Fatturato', 'target': 'Delta', 'weight': 25},
    {'area': 'Qualità del Servizio', 'objective': 'Raggiungimento di un indice di soddisfazione utenti pari o superiore al 90%', 'kpi': 'Customer Satisfaction Score', 'target': '≥90%', 'weight': 15},
    {'area': 'Sviluppo Organizzativo', 'objective': 'Raggiungimento del risultato del Piano Industriale', 'kpi': 'Consolidamento Modello Organizzativo', 'target': '100%', 'weight': 5},
]


def mbo(pct, individual):
    return {'mbo_enabled': True, 'mbo_pct': pct, 'mbo_year': 2026, 'mbo_objectives': MBO_STD + [{'area': 'Obiettivo Individuale', 'objective': individual, 'kpi': 'Performance Individuale', 'target': 'Sì/No', 'weight': 30}], 'mbo_individual': individual}


def sex_from_cf(cf):
    if not cf or len(cf) < 11:
        return None
    try:
        return 'F' if int(cf[9:11]) > 40 else 'M'
    except ValueError:
        return None


def person(key, last, first, *, sex=None, birth_place=None, birth_date=None, cf=None, piva=None, address=None, zip_=None, city=None, prov=None,
           area=None, manager=None, email=None, phone=None, title=None, kind='DIPENDENTE', status='ATTIVO', notes=None, hired_at=None):
    return {'key': key, 'person': {'kind': kind, 'status': status, 'last_name': last, 'first_name': first, 'sex': sex or sex_from_cf(cf), 'title': title,
            'birth_place': birth_place, 'birth_date': birth_date, 'tax_code': cf, 'vat_number': piva, 'phone': phone, 'email': email,
            'address': address, 'zip': zip_, 'city': city, 'province': prov, 'area_name': area, 'manager_key': manager, 'notes': notes, 'hired_at': hired_at}}


def emp(level, job, ral, start, *, ctype='TIND', hours=40, days=5, days_label='dal lunedì al venerdì', autonomous=True, site=PRATIGNONE,
        benefits=(), probation='Nessuno.', probation_days=None, steps=(), base=None, superminimo=None, absorbable=True, allowance=None,
        qualification=None, monthly=14, end=None, letter_date=None, smart=False, extra=None, ccnl='STUDI_PROFESSIONALI', notes=None):
    e = {'contract_type': ctype, 'ccnl': ccnl, 'level': level, 'qualification': qualification or ('Quadro' if level == 'Q' else 'Dirigente' if ctype == 'DIRIGENTE' else 'Apprendista' if ctype == 'APPRENDISTATO' else 'Impiegato'),
         'job_title': job, 'weekly_hours': hours, 'weekly_days': days, 'days_label': days_label, 'autonomous_hours': autonomous, 'ral': ral, 'monthly_payments': monthly,
         'base_pay': base, 'superminimo': superminimo, 'superminimo_absorbable': absorbable, 'function_allowance': allowance, 'start_date': start, 'end_date': end,
         'probation': probation, 'probation_days': probation_days, 'work_site': site, 'benefits': list(benefits), 'smart_working': smart,
         'ral_steps': [{'from': f, 'ral': r} for f, r in steps], 'letter_date': letter_date or start, 'notes': notes, 'mbo_enabled': False}
    if extra:
        e.update(extra)
    return e


PC_TEL = ['PC portatile aziendale', 'Telefono cellulare aziendale']
R = []  # risorse

# ------------------------------------------------------------------ Dipendenti
R.append({**person('epifani', 'Epifani', 'Francesco', cf='PFNFNC84M03G751B', birth_place='Poggiardo (LE)', birth_date='1984-08-03', address='Via Antonio Gramsci, 128', zip_='50019', city='Sesto Fiorentino', prov='FI', area='Direzione Generale', title='dott.', email='francesco.epifani@toscanadiagnostica.it'),
          'employment': emp('DIRIGENTE', 'Amministratore Delegato e Direttore Generale', 195000, '2026-09-01', ctype='DIRIGENTE', ccnl='DIRIGENTI_INDUSTRIA', monthly=13, base=85000 / 13, superminimo=(195000 - 85000) / 13, absorbable=False, allowance=0,
                            benefits=['Vettura aziendale (Mercedes Benz GLC Coupé)', 'Tessera carburante', 'Cellulare aziendale (iPhone) con SIM', 'PC portatile aziendale (DELL, max 14 pollici)', 'Coperture assicurative Vita, Malattie (FASI) e Infortuni'],
                            probation='Non richiesto', letter_date='2026-08-24', extra={**mbo(None, 'Completamento del Piano Industriale'), 'mbo_pct': None}, notes='Contratto CCNL Dirigenti Industria: retribuzione fissa € 195.000 su 13 mensilità (minimo tabellare € 85.000 + superminimo ad personam). Iscrizione FASI e PREVINDAI. MBO ex art. 6 CCNL con accordo allegato.')})
R.append({**person('zezza', 'Zezza', 'Valentina', cf='ZZZVNT85D61G999R', birth_place='Prato (PO)', birth_date='1985-04-21', address='Via de’ Barucci, 27', zip_='50127', city='Firenze', prov='FI', area='Laboratorio di Analisi', manager='epifani', title='dott.ssa'),
          'employment': emp('Q', 'Chief Operating Officer & BU Laboratory Manager', 90000, '2026-04-13', base=2408.53, superminimo=1206.01, absorbable=False, allowance=2814.03, benefits=['Auto aziendale ad uso promiscuo, Telepass e Tessera carburante'] + PC_TEL, smart=True, extra=mbo(10, 'Avvio completo del Laboratorio di Analisi'))})
R.append({**person('greco', 'Greco', 'Rosetta', cf='GRCRTT79L67C352D', birth_place='Catanzaro (CZ)', birth_date='1979-07-27', address='Via dell’Argingrosso, 129', zip_='50142', city='Firenze', prov='FI', area='Punti Prelievo e Accettazione', manager='zezza'),
          'employment': emp('1', 'Flow & Back Office Manager', 50000, '2026-04-13', site=BELFIORE, base=2131.39, superminimo=432.01, allowance=1008.03, benefits=PC_TEL, steps=[('2027-01-01', 55000)], smart=True, extra=mbo(10, 'Avvio completo del Software di Accettazione in tutte le strutture del Gruppo'))})
R.append({**person('sansoni', 'Sansoni', 'Silvia', cf='SNSSLV79C70D458Z', birth_place='Faenza (RA)', birth_date='1979-03-30', address='Via Terracini, 16/2', zip_='50020', city='San Casciano in Val di Pesa', prov='FI', area='Retail e Comunicazione', manager='epifani'),
          'employment': emp('1', 'Retail & Communications Manager', 50000, '2026-04-13', site=BELFIORE, base=2131.39, superminimo=432.01, allowance=1008.03, benefits=PC_TEL, steps=[('2027-01-01', 55000)], smart=True, extra=mbo(10, 'Avvio completo Piano di Comunicazione e di Retail del Gruppo'))})
R.append({**person('bussoletti', 'Bussoletti', 'Carolina', cf='BSSCLN79E68F844Q', birth_place='Narni (TR)', birth_date='1979-05-28', address='Via di Montughi, 31', zip_='50139', city='Firenze', prov='FI', area='People & Culture', manager='epifani'),
          'employment': emp('1', 'People & Culture Manager', 55000, '2026-04-13', site=BELFIORE, base=2131.39, superminimo=539.15, allowance=1258.03, benefits=PC_TEL, steps=[('2027-01-01', 60000)], smart=True, extra=mbo(10, 'Completamento degli obiettivi del Piano Industriale sul modello organizzativo e la pianta organica'))})
R.append({**person('arrighetti', 'Arrighetti', 'Sara', cf='RRGSRA96B42D612W', birth_place='Firenze (FI)', birth_date='1996-02-02', address='Via Daniele Manin, 55', zip_='59100', city='Prato', prov='PO', area='Laboratorio di Analisi', manager='zezza'),
          'employment': emp('1', 'Lab Operations Manager', 40000, '2026-04-13', base=2131.39, superminimo=217.73, allowance=508.03, benefits=PC_TEL, steps=[('2027-01-01', 42000)])})
R.append({**person('masseria', 'Masseria', 'Fabiana', cf='MSSFBN96S65G999Z', birth_place='Prato (PO)', birth_date='1996-11-25', address='Via Wangen, 29', zip_='59100', city='Prato', prov='PO', area='Finance e Amministrazione', manager='epifani', notes='Residenza: Via S. Salvatore, 21, Chiusa Sclafani (PA). Tutor aziendale: Francesco Epifani. Precedente apprendistato 01/09/2025-31/03/2026 (7 mesi).'),
          'employment': emp('2', 'Contabile e Responsabile del Controllo di Gestione (apprendistato professionalizzante)', 22092.42, '2026-04-13', ctype='APPRENDISTATO', autonomous=False, end='2028-03-12', probation='60 (sessanta) giorni di lavoro effettivo', probation_days=60,
                            base=1578.03, superminimo=0, allowance=0, steps=[('2027-03-13', 23391.90), ('2028-03-13', 25991.00)], notes='Retribuzione all’85% del minimo del livello 2 fino al 12/03/2027, 90% fino al 12/03/2028, poi 100%. Formazione interna 80 ore medie annue (art. 41 CCNL).')})
R.append({**person('baldacci', 'Baldacci', 'Sara', cf='BLDSRA83S43E625T', birth_place='Livorno (LI)', birth_date='1983-11-03', address='via Alfredo Jeri, 24', zip_='57128', city='Livorno', prov='LI', area='Punti Prelievo e Accettazione', manager='zezza'),
          'employment': emp('2', 'Manager Network Punti Prelievo', 45000, '2026-05-04', base=1856.50, superminimo=407.34, allowance=950.45, benefits=['Vettura ad uso promiscuo con decorrenza 06/2026'] + PC_TEL)})
R.append({**person('cupelli_i', 'Cupelli', 'Iacopo', cf='CPLCPI79D25D612F', birth_place='Firenze (FI)', birth_date='1979-04-25', address='Via Vasco De Gama, 33/3', zip_='50127', city='Firenze', prov='FI', area='Qualità, Sicurezza e SGI', manager='epifani'),
          'employment': emp('1', 'Health, Safety & Quality Manager', 45000, '2026-06-01', site=BELFIORE, base=2131.39, superminimo=324.87, allowance=758.03, benefits=PC_TEL, steps=[('2027-01-01', 50000)], smart=True, letter_date='2026-05-18')})
R.append({**person('fondi', 'Fondi', 'Cristina', cf='FNDCST77E66G713V', birth_place='Pistoia (PT)', birth_date='1977-05-26', address='Via G. Caponsacchi, 42', zip_='50126', city='Firenze', prov='FI', area='Anatomia Patologica', manager='zezza', title='dott.ssa'),
          'employment': emp('1', 'Responsabile Area Anatomia Patologica – Laboratorio di Analisi', 70000, '2026-06-15', base=2131.39, superminimo=860.58, allowance=2008.03, benefits=PC_TEL, steps=[('2027-01-01', 75000), ('2028-01-01', 80000)], letter_date='2026-05-18')})
R.append({**person('esposito', 'Esposito', 'Antonia', cf='SPSNTN97H62F839B', birth_place='Napoli (NA)', birth_date='1997-06-22', address='Via San Giusto, 214', zip_='50013', city='Campi Bisenzio', prov='FI', area='Laboratorio di Analisi', manager='arrighetti'),
          'employment': emp('2', 'Tecnico Sanitario di Laboratorio Biomedico', 25991, '2026-06-15', base=1856.50, superminimo=0, allowance=0, probation='30 giorni, come da previsione CCNL.', probation_days=30, letter_date='2026-05-19')})
R.append({**person('simoni', 'Simoni', 'Sara', sex='F', address='Via Travetta, 44', city='Agliana', prov='PT', area='Laboratorio di Analisi', manager='zezza', notes='Provenienza: Gentras (consulente del lavoro Rag. Lavacchi). Lettera di trasferimento sede dall’11/09/2026.'),
          'employment': emp('3', 'Biologo', 23889.18, '2026-07-01', base=1706.37, superminimo=0, allowance=0, probation='30 giorni, come da previsione CCNL.', probation_days=30, letter_date='2026-06-04')})
R.append({**person('dichiara', 'Di Chiara', 'Lisa', sex='F', area='Laboratorio di Analisi', manager='zezza'),
          'employment': emp('2', 'Biologo di Laboratorio', 25991, '2026-07-08', days=6, days_label='dal lunedì al sabato', base=1856.50, superminimo=0, allowance=0, probation='30 giorni, come da previsione CCNL.', probation_days=30, letter_date='2026-07-09')})
R.append({**person('barelli', 'Barelli', 'Stefania', sex='F', birth_place='Firenze (FI)', birth_date='1968-07-14', address='Via dell’Argingrosso, 135/5', zip_='50142', city='Firenze', prov='FI', area='Laboratorio di Analisi', manager='arrighetti', title='dott.ssa'),
          'employment': emp('2', 'Tecnico Sanitario di Laboratorio Biomedico', 46000, '2026-08-17', autonomous=False, base=1856.50, superminimo=428.76, allowance=1000.45, steps=[('2027-01-01', 48000), ('2028-01-01', 50000)], probation='Nessuno', letter_date='2026-06-15')})
R.append({**person('stabile', 'Stabile', 'Federico', cf='STBFRC99H16D612D', birth_place='Firenze (FI)', birth_date='1999-06-16', address='Via Carbolinga, 62', zip_='51031', city='Agliana', prov='PT', area='Punti Prelievo e Accettazione', manager='baldacci', email='stabilefederico48@gmail.com', title='dott.', notes='In precedenza infermiere libero professionista (contratto LP 2026) presso il Punto Prelievi di Montemurlo.'),
          'employment': emp('2', 'Coordinatore Personale Sanitario', 35000, '2026-08-31', base=1856.50, superminimo=193.05, allowance=450.45, benefits=PC_TEL, steps=[('2027-01-01', 39000)], letter_date='2026-04-13'),
          'letters': [{'status': 'CONVERTITA', 'letter_date': '2026-07-14', 'start_by': '2026-09-01', 'valid_until': '2026-07-20', 'level': '2', 'qualification': 'Impiegato', 'job_title': 'Coordinatore Personale Sanitario', 'ral': 35000, 'ral_steps': [{'from': '2027-01-01', 'ral': 39000}], 'autonomous_hours': True, 'accepted_at': '2026-07-20'}]})
R.append({**person('mati', 'Mati', 'Leonardo', cf='MTALRD03M05G999W', birth_place='Prato (PO)', birth_date='2003-08-05', address='Viale Fratelli Cervi, 78', zip_='59100', city='Prato', prov='PO', area='Laboratorio di Analisi', manager='arrighetti'),
          'employment': emp('3', 'Addetto di Laboratorio', 23889.18, '2026-09-01', days=6, days_label='dal lunedì al sabato', base=1706.37, superminimo=0, allowance=0, letter_date='2026-04-13'),
          'letters': [{'status': 'CONVERTITA', 'letter_date': '2026-07-02', 'start_by': '2026-09-01', 'valid_until': '2026-07-07', 'level': '3', 'qualification': 'Impiegato', 'job_title': 'Addetto di Laboratorio', 'ral': 23889.18, 'autonomous_hours': True, 'accepted_at': '2026-07-07', 'notes': 'Formazione tutorata dalla sottoscrizione alla decorrenza del rapporto.'}]})
R.append({**person('perini', 'Perini', 'Irene', sex='F', area='Punti Prelievo e Accettazione', manager='greco', notes='Provenienza: Cifs (consulente del lavoro Dott. Boccalini).'),
          'employment': emp('3', 'Impiegata – segreteria e accettazione pazienti', 23889.18, '2026-09-01', autonomous=False, base=1706.37, superminimo=0, allowance=0, probation='Come previsto dal CCNL.')})
R.append({**person('quattrone', 'Quattrone', 'Silvia', cf='QTTSLV71H51G999X', birth_place='Prato (PO)', birth_date='1971-06-11', address='Via del Cilianuzzo, 97/E2', city='Prato', prov='PO', area='Laboratorio di Analisi', manager='zezza', notes='Provenienza: Gentras.'),
          'employment': emp('1', 'Responsabile Area Biologia Molecolare', 50000, '2026-09-09', base=2131.39, superminimo=432.01, allowance=1008.03, probation='30 giorni, come da previsione CCNL.', probation_days=30, site='via di Pratignone, 13/4, Sesto Fiorentino (FI)')})
R.append({**person('balzano', 'Balzano', 'Maria Teresa', cf='BLZMTR84P46G942C', birth_place='Potenza (PZ)', birth_date='1984-09-06', address='Via Carissimi, 45', zip_='50127', city='Firenze', prov='FI', area='Laboratorio di Analisi', manager='zezza', title='dott.ssa'),
          'employment': emp('1', 'Direttore Tecnico del Laboratorio di Analisi', 47000, '2026-10-01', base=2131.39, superminimo=367.73, allowance=858.03, steps=[('2027-01-01', 50000)], probation='30 giorni, come da previsione CCNL.', probation_days=30, letter_date='2026-07-13',
                            benefits=['Telefono cellulare aziendale', 'PC portatile aziendale con accesso remoto ai sistemi aziendali, secondo le policy vigenti', 'Assistenza legale', 'Copertura dei costi annuali di iscrizione all’albo professionale e assicurazione professionale'], notes='La lettera indicava decorrenza 15/09/2026; UNILAV con assunzione 01/10/2026.'),
          'letters': [{'status': 'CONVERTITA', 'letter_date': '2026-06-30', 'start_by': '2026-09-15', 'level': '1', 'qualification': 'Impiegato', 'job_title': 'Direttore Tecnico del Laboratorio di Analisi', 'ral': 46000, 'ral_steps': [{'from': '2027-06-01', 'ral': 50000}], 'autonomous_hours': True, 'accepted_at': '2026-07-10'}]})
R.append({**person('marchisello', 'Marchisello Di Blasi', 'Claudio', sex='M', area='Laboratorio di Analisi', manager='arrighetti'),
          'employment': emp('2', 'Tecnico Sanitario di Laboratorio Biomedico', 34500, '2026-10-01', days=6, days_label='dal lunedì al sabato', autonomous=False, base=1856.50, superminimo=182.34, allowance=425.45, probation='Come previsto dal CCNL.', probation_days=120, letter_date='2026-08-12')})
R.append({**person('mariotti', 'Mariotti', 'Beatrice', sex='F', area='Laboratorio di Analisi', manager='arrighetti'),
          'employment': emp('2', 'Tecnico Sanitario di Laboratorio Biomedico', 34500, '2026-10-01', days=6, days_label='dal lunedì al sabato', autonomous=False, base=1856.50, superminimo=182.34, allowance=425.45, probation='Come previsto dal CCNL.', probation_days=120, letter_date='2026-08-12')})
R.append({**person('corradi', 'Corradi', 'Angelica', cf='CRRNLC75D47D612T', birth_place='Firenze (FI)', birth_date='1975-04-07', address='via Pastrengo, 20', city='Firenze', prov='FI', area='People & Culture', manager='epifani', title='avv.', piva='07398680483', notes='Consulente legale LP dal 31/08/2026 al 05/10/2026, poi assunta.'),
          'employment': emp('Q', 'Chief People, Organization and Legal Officer', 83360, '2026-10-07', base=2408.53, superminimo=3305.76, absorbable=False, allowance=240, benefits=PC_TEL, letter_date='2026-10-06', extra=mbo(25, 'Completamento del Piano Industriale'))})
R.append({**person('malenchini', 'Malenchini', 'Vincenzo', cf='MLNVCN74C29D612F', birth_place='Firenze (FI)', birth_date='1974-03-29', address='via Pastrengo, 20', city='Firenze', prov='FI', area='Finance e Amministrazione', manager='epifani', title='dott.', piva='07428130483', notes='Consulente finanziario LP dal 31/08/2026 al 05/10/2026, poi assunto.'),
          'employment': emp('Q', 'Chief Financial Officer', 93360, '2026-10-07', base=2408.53, superminimo=4020.04, absorbable=False, allowance=240, benefits=PC_TEL + ['Vettura aziendale, Telepass e tessera carburante'], letter_date='2026-10-06', extra=mbo(25, 'Completamento del Piano Industriale'))})
R.append({**person('momini', 'Momini', 'Valeria', sex='F', area='Laboratorio di Analisi', manager='zezza', status='IMPEGNO', notes='Assunzione alla data di sottoscrizione dell’atto di cessione dell’impresa (ottobre 2026). Sede: Livorno.'),
          'employment': emp('2', 'Biologo', 25991, None, hours=24, days=6, days_label='dal lunedì al sabato', autonomous=False, site=LIVORNO, base=1856.50, superminimo=0, allowance=0, probation='30 giorni, come da previsione CCNL.', probation_days=30, letter_date='2026-08-10', notes='Part-time 24 ore: RAL full time € 25.991,00 riproporzionata.')})
R.append({**person('monti', 'Monti', 'Milena', sex='F', area='Punti Prelievo e Accettazione', manager='stabile', status='IMPEGNO', notes='Assunzione alla data di sottoscrizione dell’atto di cessione dell’impresa (ottobre 2026). Sede: Livorno.'),
          'employment': emp('2', 'Infermiere', 25991, None, hours=24, days=6, days_label='dal lunedì al sabato', autonomous=False, site=LIVORNO, base=1856.50, superminimo=0, allowance=0, probation='30 giorni, come da previsione CCNL.', probation_days=30, letter_date='2026-08-10', notes='Part-time 24 ore: RAL full time € 25.991,00 riproporzionata.')})
R.append({**person('chilleri', 'Chilleri', 'Chiara', sex='F', area='Laboratorio di Analisi', manager='zezza', status='IMPEGNO', title='dott.ssa'),
          'letters': [{'status': 'ACCETTATA', 'letter_date': '2026-09-13', 'start_by': '2026-11-09', 'level': '1', 'qualification': 'Impiegato', 'job_title': 'Responsabile Area Microbiologia – Laboratorio di Analisi', 'ral': 40000, 'ral_steps': [{'from': '2028-01-01', 'ral': 42000}], 'autonomous_hours': True, 'accepted_at': '2026-09-15', 'notes': 'Lettera firmata (PDF nel dossier). Validità indicata nel format: 10 giugno 2026 (refuso).'}]})
R.append({**person('costi', 'Costi', 'Natalia', sex='F', area='Procurement e Logistica', manager='zezza', status='IMPEGNO'),
          'letters': [{'status': 'INVIATA', 'letter_date': '2026-10-08', 'start_by': '2026-11-16', 'level': '2', 'qualification': 'Impiegato', 'job_title': 'Procurement Manager', 'ral': 26500, 'ral_steps': [{'from': '2027-09-01', 'ral': 28000}], 'autonomous_hours': True, 'notes': 'Validità indicata nel format: 20 luglio 2026 (refuso, da confermare).'}]})
R.append({**person('testa', 'Testa', 'Elisa', sex='F', area='Laboratorio di Analisi', manager='zezza', status='CANDIDATO', title='dott.ssa'),
          'letters': [{'status': 'SCADUTA', 'letter_date': '2026-08-02', 'start_by': '2026-09-01', 'valid_until': '2026-08-09', 'level': '1', 'qualification': 'Impiegato', 'job_title': 'Responsabile Area Microbiologia – Laboratorio di Analisi', 'ral': 37000, 'ral_steps': [{'from': '2027-01-01', 'ral': 38500}], 'autonomous_hours': True, 'notes': 'Proposta non perfezionata (stato da confermare).'}]})
R.append({**person('fini', 'Fini', 'Eleonora', sex='F', area='Laboratorio di Analisi', manager='zezza', status='CANDIDATO', title='dott.ssa'),
          'letters': [{'status': 'SCADUTA', 'letter_date': '2026-06-18', 'start_by': '2026-07-01', 'valid_until': '2026-06-23', 'level': '2', 'qualification': 'Impiegato', 'job_title': 'Biologo', 'ral': 29500, 'autonomous_hours': True, 'notes': 'Proposta non perfezionata (stato da confermare).'}]})

# ------------------------------------------------------------------ Liberi professionisti
def lp(discipline, role, start, end, fees, *, degrees=(), order=None, order_prov=None, order_no=None, order_since=None, insurance=1000000, ins_expiry=None, activities=(), letter_date=None, notes=None, est=None):
    return {'discipline': discipline, 'role_description': role, 'activities': list(activities), 'degrees': list(degrees), 'order_name': order, 'order_province': order_prov, 'order_number': order_no, 'order_since': order_since,
            'insurance_required': insurance, 'insurance_expiry': ins_expiry, 'start_date': start, 'end_date': end, 'auto_renew': True, 'notice_days': 30, 'fees': fees, 'est_monthly_cost': est, 'letter_date': letter_date or start, 'notes': notes}


AP_FEES = lambda fixed: [
    {'type': 'FISSO', 'description': 'Compenso mensile per attività di refertazione e consulenza di Anatomia Patologica (componente fissa)', 'category': 'Anatomia Patologica', 'amount': fixed},
    {'type': 'PRESTAZIONE', 'description': 'Compenso per attività di refertazione e consulenza di Anatomia Patologica (componente variabile)', 'category': 'Anatomia Patologica', 'amount': 20, 'unit': 'referto'},
    {'type': 'PRESTAZIONE', 'description': 'Esame intraoperatorio presso la sede del cliente per ogni singolo esame', 'category': 'Anatomia Patologica', 'amount': 350, 'unit': 'cad'},
]
NURSE_FEES = [{'type': 'ORARIO', 'description': 'Prestazione sanitaria infermieristica', 'category': 'Infermieristica', 'amount': 25, 'unit': 'ora', 'notes': '+ 4% di cassa previdenziale'}]

R.append({**person('cupelli_v', 'Cupelli', 'Vincenzo', kind='LP', cf='CPLVCN44T05L607Q', piva='06590690480', birth_place='Vallelonga', birth_date='1944-12-05', address='via Trieste, 37', city='Firenze', prov='FI', area='Medicina del Lavoro', manager='epifani', title='prof.'),
          'lp': lp('Medicina del Lavoro', 'la consulenza sanitaria negli ambiti per cui il Professionista è abilitato', '2026-05-04', '2027-05-03',
                   [{'type': 'FISSO', 'description': 'Coordinatore Sanitario della Branca di Medicina del Lavoro', 'category': 'Direzione', 'amount': 1500, 'notes': 'All’attivazione dell’Area di Business'},
                    {'type': 'FISSO', 'description': 'Direzione Sanitaria di Centri Medici', 'category': 'Direzione', 'amount': 550},
                    {'type': 'FISSO', 'description': 'Direzione Sanitaria di Punti Prelievo (gruppi di 3)', 'category': 'Direzione', 'amount': 450},
                    {'type': 'PRESTAZIONE', 'description': 'Visita medica pre-assuntiva, periodica, per cambio mansione', 'category': 'Area Medicina del Lavoro', 'amount': 35, 'unit': 'cad', 'notes': 'Salvo condizioni particolari richieste da imprese clienti, concordate preventivamente'},
                    {'type': 'PRESTAZIONE', 'description': 'Esami strumentali (eventuali)', 'category': 'Area Medicina del Lavoro', 'amount': 15, 'unit': 'cad'},
                    {'type': 'ORARIO', 'description': 'Attività di sopralluogo, consulenza e assistenza', 'category': 'Area Medicina del Lavoro', 'amount': 60, 'unit': 'ora'},
                    {'type': 'VARIABILE', 'description': 'Prestazioni di laboratorio in azienda', 'category': 'Area Medicina del Lavoro', 'amount': 10, 'notes': 'Del fatturato derivante da prestazioni di laboratorio svolte in aziende procacciate dal professionista'}],
                   degrees=['Laurea in Medicina e Chirurgia conseguita presso Firenze in data 28/08/1969', 'Specializzazione in Medicina dello sport conseguita presso Bologna in data 07/07/1987', 'Specializzazione in Malattie Cardiovascolari e Reumatiche conseguita presso Firenze in data 14/07/1972', 'Specializzazione in Medicina del Lavoro conseguita presso Firenze in data 15/07/1975'],
                   order='Ordine dei Medici Chirurghi e Odontoiatri', order_prov='Firenze', order_no='4080', order_since='1970-02-16', letter_date='2026-04-13', est=2500)})
R.append({**person('cesati', 'Cesati', 'Valentina', kind='LP', cf='CSTVNT74P66D612K', piva='07573650483', birth_place='Firenze (FI)', birth_date='1974-09-26', address='via Quintole per le Rose, 75', city='Impruneta', prov='FI', area='Retail e Comunicazione', manager='epifani', title='dott.ssa', notes='Decorrenza indicata nel contratto come X/06/2026: da confermare.'),
          'lp': lp('Business Development', 'lo sviluppo commerciale in Area B2B e B2C, con specifico riferimento all’Area di Laboratorio di Analisi', '2026-06-01', '2027-05-31',
                   [{'type': 'FISSO', 'description': 'Business Development – compenso fisso mensile', 'category': 'Direzione Commerciale', 'amount': 3000}, {'type': 'VARIABILE', 'description': 'Componente variabile su obiettivi (MBO)', 'category': 'Direzione Commerciale', 'amount': 5, 'notes': 'del fatturato generato'}, {'type': 'FISSO', 'description': 'Rimborso spese', 'category': 'Direzione Commerciale', 'amount': 0, 'notes': 'PREVISTO'}],
                   degrees=['Laurea in Scienze Biologiche conseguita presso l’Università degli Studi di Firenze in data 14/07/1999', 'Dottorato in Morfologia e Morfogenesi Umana conseguito presso l’Università degli Studi di Firenze in data 09/06/2004'],
                   activities=['analisi di mercato e individuazione di opportunità commerciali;', 'sviluppo e gestione di relazioni con clienti, partner e prospect;', 'definizione e attuazione di strategie di acquisizione e fidelizzazione clienti;', 'supporto alla negoziazione di accordi commerciali, convenzioni e partnership;', 'predisposizione di offerte commerciali, presentazioni e reportistica di settore;', 'attività di networking e partecipazione, ove richiesta, ad eventi di settore.'],
                   order='Ordine dei Biologi', order_prov='Toscana e Umbria', order_no='ToU_A2192', order_since='2022-12-05', letter_date='2026-09-04')})
R.append({**person('urso', 'Urso', 'Carmelo', kind='LP', cf='RSUCML56A04E573D', piva='06770670484', birth_place='Licata (AG)', birth_date='1956-01-04', address='via della Cernaia, 88', city='Firenze', prov='FI', area='Anatomia Patologica', manager='fondi', title='dott.', email='cylaur@libero.it'),
          'lp': lp('Anatomia Patologica', 'la consulenza sanitaria negli ambiti per cui il Professionista è abilitato', '2026-05-04', '2027-05-03', AP_FEES(4500), degrees=['Laurea in Medicina e Chirurgia conseguita presso Università degli Studi di Firenze in data 17/04/1982', 'Specializzazione in Anatomia Patologica conseguita presso Università di Siena in data 08/07/1986'], order='Ordine Provinciale dei Medici Chirurghi e degli Odontoiatri', order_prov='Firenze', order_no='9549', order_since='1990-11-26', ins_expiry='2026-09-12')})
R.append({**person('taddei', 'Taddei', 'Gian Luigi', kind='LP', cf='TDDGLG46C02D612L', piva='06685560481', birth_place='Firenze (FI)', birth_date='1946-03-02', address='viale Giuseppe Mazzini, 31', zip_='50132', city='Firenze', prov='FI', area='Anatomia Patologica', manager='epifani', title='prof.', email='taddeigianluigi@gmail.com'),
          'lp': lp('Anatomia Patologica / Direzione Sanitaria', 'la consulenza sanitaria negli ambiti per cui il Professionista è abilitato', '2026-05-04', '2027-05-03', [{'type': 'FISSO', 'description': 'Direttore Sanitario del Laboratorio di Analisi di Toscana Diagnostica', 'category': 'Direzione', 'amount': 1500}] + AP_FEES(4500), degrees=['Laurea in Medicina e Chirurgia conseguita presso Università degli Studi di Firenze in data 07/11/1972', 'Specializzazione in Anatomia Patologica e Tecniche di Laboratorio conseguita presso Università di Parma in data 27/07/1977'], order='Ordine Provinciale dei Medici Chirurghi e degli Odontoiatri', order_prov='Firenze', order_no='4732', order_since='1974-09-09', ins_expiry='2026-11-01')})
R.append({**person('tinacci', 'Tinacci', 'Galliano', kind='LP', cf='TNCGLN53A29D583W', piva='07094410482', birth_place='Figline Valdarno (FI)', birth_date='1953-01-29', address='Via G. Mameli, 12', city='Reggello', prov='FI', area='Anatomia Patologica', manager='fondi', title='dott.', email='gallianotinacci@gmail.com', notes='Numero di iscrizione all’Ordine nel contratto (9549) coincide con quello di Urso: verificare sul certificato.'),
          'lp': lp('Anatomia Patologica', 'la consulenza sanitaria negli ambiti per cui il Professionista è abilitato', '2026-05-04', '2027-05-03', AP_FEES(2500), degrees=['Laurea in Medicina e Chirurgia conseguita presso Università degli Studi di Firenze in data 12/04/1983', 'Specializzazione in Anatomia Patologica conseguita presso Università di Siena in data 03/07/1987'], order='Ordine Provinciale dei Medici Chirurghi e degli Odontoiatri', order_prov='Firenze', order_no=None, order_since=None, ins_expiry='2026-08-27')})
for key, last, first, cf, bp, bd, email, site, pol in [
    ('gori', 'Gori', 'Caterina', 'GROCRN89S63G999U', 'Prato (PO)', '1989-11-23', 'categori1989@hotmail.it', 'Montemurlo', '2026-12-30'),
    ('dipietro', 'Di Pietro', 'Matteo', 'DPTMTT93H12G713D', 'Pistoia (PT)', '1993-06-12', 'dipietro.matteo93@yahoo.com', 'Quarrata', None),
    ('contino', 'Contino', 'Anna', 'CNTNNA96B45D612D', 'Firenze (FI)', '1996-02-05', 'annacontino96@gmail.com', 'Calenzano', '2026-12-30'),
    ('tellini', 'Tellini', 'Cinzia', 'TLLCNZ63S42G702N', 'Pisa (PI)', '1963-11-02', 'cinziatrilly63@msn.com', 'Firenze', '2026-12-30'),
]:
    R.append({**person(key, last, first, kind='LP', cf=cf, birth_place=bp, birth_date=bd, email=email, area='Punti Prelievo e Accettazione', manager='stabile', title='dott.ssa' if sex_from_cf(cf) == 'F' else 'dott.', notes=f'Punto prelievi di {site}.'),
              'lp': lp('Infermieristica', 'la consulenza sanitaria negli ambiti per cui il Professionista è abilitato', '2026-05-06', '2027-05-05', NURSE_FEES, order='Ordine delle Professioni Infermieristiche', ins_expiry=pol, notes='Dati contrattuali da verificare sul contratto firmato nel dossier.')})
for key, last, first in [('zavoli', 'Zavoli', 'Giampiero'), ('margheri', 'Margheri', 'Federico'), ('benevieri', 'Benevieri', 'Gianni')]:
    R.append({**person(key, last, first, kind='LP', area='Punti Prelievo e Accettazione', manager='stabile', notes='Tecnico LP, Borgo San Lorenzo: anagrafica e contratto da completare.'), 'lp': lp('Tecnico', None, None, None, [])})
R.append({**person('bernardo', 'Bernardo', 'Silvia', kind='LP', sex='F', area='Direzione Generale', manager='epifani', notes='Lettera di incarico firmata 05/10/2026 e mandato professionale nel dossier: disciplina e compensi da completare.'), 'lp': lp(None, None, '2026-10-05', None, [])})

# ------------------------------------------------------------------ Allegati: mappatura per nome file
RULES = [
    (r'150 -|unilav', 'UNILAV'), (r'^mbo ', 'MBO'), (r'\.sw\.|smart working|-sw\.', 'SMART_WORKING'),
    (r'regolamento|reg\. generale|reg gen|reg004', 'REGOLAMENTO'), (r'lettera di impegno', 'LETTERA_IMPEGNO'),
    (r'contratto lp|lp signed', 'ALTRO'), (r'contratto|\bctr\b|lettera assunzione|lettera di assunzione|signed|firmato|sottoscritto|f\.to|scansione', 'CONTRATTO_FIRMATO'),
    (r'allegati al contratto|allegato contratto', 'ALTRO'),
    (r'\bci\b|c\.i\.|carta ident|carta iden|identit|documento id|doc[1-4]\.jpg|documenti assunzione|^documenti ', 'CI'), (r'\bcf\b|codice fiscale|tessera sanitaria', 'CF'),
    (r'\bcv\b|cv_|_cv|curriculum', 'CV'), (r'titol|laurea|dottorato|specializzazione|master|abilitazione', 'TITOLO_STUDIO'),
    (r'albo|ordine|opi|pagopa|ricevutapagamento|attestato_pagamento|certificato_di_iscrizione|certificato \(1\)|iscrizione', 'ALBO'),
    (r'detrazioni', 'DETRAZIONI'), (r'tfr|fonte|prosecuzione', 'TFR'), (r'l335|massimale', 'L335'), (r'dati bancari|mod078', 'DATI_BANCARI'),
    (r'politica|pol001', 'POLITICA_SGI'), (r'specimen|mod032|^firma\.pdf', 'SPECIMEN_FIRMA'), (r'consegna|mod030|dotazioni', 'CONSEGNA_DOTAZIONI'),
    (r'ecm|cogeaps', 'ECM'), (r'sicurezza', 'FORMAZIONE_SICUREZZA'), (r'attestato|formazione|training|mod035|bls', 'FORMAZIONE'),
    (r'assicura|polizza', 'POLIZZA_RC'), (r'p\.iva|piva|partita iva', 'PIVA'), (r'dimissione', 'ALTRO'), (r'parcheggio|deroga|trasferimento|ccnl dirigenti|dnaonline|raccolta dati', 'ALTRO'),
]


def categorize(name):
    n = name.lower()
    for pat, cat in RULES:
        if re.search(pat, n):
            return cat
    return 'ALTRO'


def signed_flag(name):
    return bool(re.search(r'signed|firmato|sottoscritto|f\.to|_firma|scansione|contratto 1|contratto 3', name.lower()))


def expiry_for(cat, name):
    n = name.lower()
    if cat == 'ALBO' and ('2026' in n or 'quota' in n or 'pagamento' in n or 'ricevuta' in n):
        return '2026-12-31'
    if cat == 'FORMAZIONE_SICUREZZA' and '2024' in n:
        return '2029-10-31'
    if cat == 'ECM' and ('2026' in n or '26-28' in n or 'schermata' in n):
        return '2028-12-31'
    return None


FOLDERS = {
    'epifani': ['Dipendenti/Epifani Francesco'], 'zezza': ['Dipendenti/Zezza Valentina'], 'greco': ['Dipendenti/Greco Rosetta'], 'sansoni': ['Dipendenti/Sansoni Silvia'],
    'bussoletti': ['Dipendenti/Bussoletti Carolina', 'Dipendenti/ECM dipendenti sanitari/BUSSOLETTI'], 'arrighetti': ['Dipendenti/Arrighetti Sara'], 'masseria': ['Dipendenti/Masseria Fabiana', 'Assunzioni/Masseria - Lettera di Assunzione apprendista.pdf'],
    'baldacci': ['Dipendenti/Baldacci Sara'], 'cupelli_i': ['Dipendenti/Cupelli Iacopo'], 'fondi': ['Dipendenti/Fondi Cristina'], 'esposito': ['Dipendenti/Esposito Antonia'], 'simoni': ['Dipendenti/Simoni Sara'],
    'dichiara': ['Dipendenti/Di Chiara Lisa', 'Lettere di Impegno/Lettera di Impegno - Lisa Di Chiara.pdf'], 'barelli': ['Dipendenti/Barelli Stefania'],
    'stabile': ['Dipendenti/Stabile Federico', 'Lettere di Impegno/Lettera di Impegno - Federico Stabile.pdf', 'LP/LP Attivi/contratti e documentazione LP/documentazione Federico Stabile'],
    'mati': ['Dipendenti/Mati Leonardo', 'Lettere di Impegno/Lettera di Impegno - Leonardo Mati.pdf'], 'perini': ['Dipendenti/Perini Irene'], 'quattrone': ['Dipendenti/Quattrone Silvia'],
    'balzano': ['Dipendenti/Balzano Maria Teresa', 'Dipendenti/Maria Teresa Balzano', 'Lettere di Impegno/Lettera di Impegno - Maria Teresa Balzano.pdf'],
    'marchisello': ['Dipendenti/Marchisello Di Blasi Claudio'], 'mariotti': ['Dipendenti/Mariotti Beatrice'], 'corradi': ['Dipendenti/Corradi Angelica'], 'malenchini': ['Dipendenti/Malenchini Vincenzo'],
    'momini': ['Dipendenti/Momini Valeria'], 'monti': ['Dipendenti/Monti Milena'], 'chilleri': ['Dipendenti/Chilleri Chiara', 'Lettere di Impegno/Lettera di Impegno - Chiara Chilleri.pdf'],
    'costi': ['Lettere di Impegno/Lettera di Impegno - Natalia Costi.pdf'], 'testa': ['Lettere di Impegno/Lettera di Impegno - Elisa Testa.pdf'], 'fini': ['Dipendenti/Fedi Eleonora', 'Assunzioni/Lettera di Impegno - Fini Eleonora.pdf'],
    'cupelli_v': ['LP/LP Attivi/contratti e documentazione LP/documentazione Vincenzo Cupelli'], 'cesati': ['LP/LP Attivi/Contratto LP - Valentina Cesati.pdf', 'LP/LP Attivi/Cesati Valentina'],
    'urso': ['LP/LP Attivi/contratti e documentazione LP/documentazione Carmelo Urso'], 'taddei': ['LP/LP Attivi/contratti e documentazione LP/documentazione Gianluigi Taddei'], 'tinacci': ['LP/LP Attivi/contratti e documentazione LP/documentazione Galliano Tinacci'],
    'gori': ['LP/LP Attivi/contratti e documentazione LP/documentazione Caterina Gori'], 'dipietro': ['LP/LP Attivi/contratti e documentazione LP/documentazione Matteo di Pietro'],
    'contino': ['LP/LP Attivi/contratti e documentazione LP/documentazione Anna Contino'], 'tellini': ['LP/LP Attivi/contratti e documentazione LP/Documentazione CINZIA TELLINI'], 'bernardo': ['LP/LP Attivi/Silvia Bernardo'],
}
SKIP = re.compile(r'\.docx$|\.doc$|\.xls$|\.xlsx$', re.I)  # i sorgenti Word restano in OneDrive; nel dossier vanno PDF, immagini e zip


def collect(key):
    out = []
    for rel in FOLDERS.get(key, []):
        p = os.path.join(HRM, rel)
        if os.path.isfile(p):
            out.append(p)
        elif os.path.isdir(p):
            for root, _, files in os.walk(p):
                for f in sorted(files):
                    out.append(os.path.join(root, f))
    return out


by_key = {r['key']: r for r in R}
zipf = zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED)
added = 0
for key, r in by_key.items():
    r.setdefault('attachments', [])
    seen = set()
    for p in collect(key):
        name = os.path.basename(p)
        if SKIP.search(name) and not name.lower().endswith('.docx') and not name.lower().endswith(('.xls', '.xlsx', '.doc')):
            continue
        if SKIP.search(name):
            continue
        if name in seen:
            continue
        seen.add(name)
        cat = categorize(name)
        stem = re.sub(r'\.[a-z0-9]+$', '', name.lower())
        full = f"{r['person']['last_name']} {r['person']['first_name']}".lower()
        if stem in (full, r['person']['last_name'].lower(), f"{r['person']['first_name']} {r['person']['last_name']}".lower()):
            cat = 'CONTRATTO_FIRMATO'
        if r['person']['kind'] == 'LP' and 'contratto lp' in name.lower():
            cat = 'CONTRATTO_FIRMATO'
        sub = os.path.basename(os.path.dirname(p))
        if sub.upper() in ('ECM', 'ECM 26-28') or 'ECM dipendenti' in p:
            cat = 'ECM'
        if sub == 'TFR':
            cat = 'TFR'
        if sub == 'CORSI DI FORMAZIONE':
            cat = 'FORMAZIONE'
        arc = f'files/{key}/{name}'
        zipf.write(p, arc)
        added += 1
        r['attachments'].append({'path': arc, 'filename': name, 'category': cat, 'signed': signed_flag(name), 'expires_at': expiry_for(cat, name), 'is_cv': cat == 'CV',
                                 'notes': 'Importato da OneDrive/HRM'})

manifest = {'version': 1, 'generated_from': 'OneDrive/HRM', 'resources': R, 'cv_box': []}
zipf.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=1))
zipf.close()
print(f'Pacchetto {OUT}: {len(R)} risorse, {added} allegati, {os.path.getsize(OUT) / 1e6:.1f} MB')
