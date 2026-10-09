"""Costruisce i template docxtemplater partendo dai format aziendali originali.

Uso: python3 tools/build_templates.py <cartella sorgenti> <cartella destinazione>
Sorgenti attese: zezza.docx (contratto dipendente), mbo.docx, impegno.docx, lp_cupelli.docx, masseria.docx.
"""
import copy
import sys
from docx import Document

SRC, DST = sys.argv[1], sys.argv[2]


def set_text(p, text):
    runs = p.runs
    if not runs:
        p.add_run(text)
        return
    runs[0].text = text
    for r in runs[1:]:
        r._element.getparent().remove(r._element)


def repl(p, old, new, must=True):
    t = p.text
    if old in t:
        set_text(p, t.replace(old, new))
        return True
    if must:
        raise SystemExit(f'Testo non trovato: {old!r} in {t[:80]!r}')
    return False


def repl_any(paragraphs, old, new, must=True, all_occ=True):
    n = 0
    for p in paragraphs:
        if old in p.text:
            set_text(p, p.text.replace(old, new))
            n += 1
            if not all_occ:
                break
    if must and n == 0:
        raise SystemExit(f'Testo non trovato: {old!r}')
    return n


def delete(p):
    p._element.getparent().remove(p._element)


def clone_after(p, text, src=None):
    el = copy.deepcopy((src or p)._element)
    p._element.addnext(el)
    from docx.text.paragraph import Paragraph
    np = Paragraph(el, p._parent)
    set_text(np, text)
    return np


def loop_block(p, open_tag, body, close_tag):
    """Trasforma il paragrafo p in un blocco: paragrafo con solo il tag di apertura, paragrafo corpo, paragrafo di chiusura."""
    set_text(p, open_tag)
    b = clone_after(p, body)
    c = clone_after(b, close_tag)
    return c


def all_paragraphs(doc):
    out = list(doc.paragraphs)
    for t in doc.tables:
        for row in t.rows:
            for c in row.cells:
                out.extend(c.paragraphs)
    return out


def find(paragraphs, start):
    for p in paragraphs:
        if p.text.strip().startswith(start):
            return p
    raise SystemExit(f'Paragrafo non trovato: {start!r}')


# ---------------- Contratto dipendente (tempo indeterminato / determinato) ----------------
def build_contratto():
    d = Document(f'{SRC}/zezza.docx')
    P = d.paragraphs
    repl_any(P, 'Valentina Zezza', '{nome_completo}')
    repl(find(P, 'Via de’ Barucci'), 'Via de’ Barucci, 27', '{indirizzo}')
    repl(find(P, '50127 Firenze'), '50127 Firenze (FI)', '{cap_citta}')
    repl(find(P, 'Nata a Prato'), 'Nata a Prato (PO) il 21/04/1985', '{nato_a} {luogo_nascita} il {data_nascita}')
    repl(find(P, 'C.F. ZZZ'), 'ZZZVNT85D61G999R', '{cf}')
    repl(find(P, 'Oggetto:'), 'contratto a tempo indeterminato', 'contratto a tempo {tipo_contratto}')
    repl(find(P, 'Con riferimento alle intese'), 'Le confermiamo la Sua assunzione alle dipendenze della nostra Società, con contratto a tempo indeterminato full-time',
         'Le confermiamo{prova_premessa} la Sua assunzione alle dipendenze della nostra Società, con contratto a tempo {tipo_contratto} {regime_orario}')
    repl_any(P, 'Firenze, 13/04/2026', '{citta_lettera}, {data_lettera}')
    t = d.tables[0]
    rows = {r.cells[0].text.strip(): r.cells[1] for r in t.rows}
    c = rows['Data assunzione:']
    repl(c.paragraphs[0], '13/04/2026', '{data_assunzione}')
    c = rows['Inquadramento:']
    repl(c.paragraphs[0], 'Ella sarà inquadrato nel Livello Q del CCNL;', 'Ella sarà {inquadrato} nel Livello {livello} del CCNL;')
    c = rows['Mansioni:']
    repl(c.paragraphs[0], 'Chief Operating Officer & BU Laboratory Manager', '{mansione}')
    c = rows['Orario di lavoro:']
    set_text(c.paragraphs[0], "L'orario di lavoro sarà di {ore_settimanali} ore settimanali distribuito su {giorni_settimanali} giorni settimanali {giorni_label}.{clausola_orario}")
    for p in c.paragraphs[1:]:
        delete(p)
    c = rows['Retribuzione:']
    ps = c.paragraphs
    set_text(ps[0], 'La Sua retribuzione{regime_frase} sarà di euro {ral} lordi annui, erogata in {mensilita} mensilità di importo pari a euro {ral_mensile} lordi mensili{composta_intro}')
    for p in ps[2:]:
        delete(p)
    last = loop_block(ps[1], '{#voci}', '{label}: euro {importo}', '{/voci}')
    p = clone_after(last, '{#scatti}', src=ps[0])
    p = clone_after(p, 'Comunichiamo fin da adesso che con decorrenza {dal} la Sua retribuzione passerà ad euro {ral} lordi annui. Provvederemo a tempo debito a formalizzare tale aumento con nuova comunicazione nella quale saranno indicate le precisazioni del caso.')
    p = clone_after(p, '{/scatti}')
    p = clone_after(p, '{#mbo}')
    p = clone_after(p, 'Per lo specifico ruolo Le potrà essere assegnato, in aggiunta alla Sua RAL come sopra determinata, anche un premio per obiettivi (MBO) fino al {mbo_pct}% della RAL, definito da specifico accordo annuale.')
    clone_after(p, '{/mbo}')
    c = rows['Periodo di Prova:']
    set_text(c.paragraphs[0], '{periodo_prova}')
    for p in c.paragraphs[1:]:
        delete(p)
    c = rows['Sede di Lavoro:']
    repl(c.paragraphs[0], 'via di Pratignone, 13/4, 50019 Sesto Fiorentino (FI).', '{sede_lavoro}.')
    c = rows['Benefits e dotazioni di lavoro:']
    ps = c.paragraphs
    for p in ps[2:]:
        delete(p)
    last = loop_block(ps[1], '{#benefits}', '{.}', '{/benefits}')
    last = loop_block(ps[0], '{#has_benefits}', 'Per svolgere le sue mansioni, Le saranno concessi i seguenti benefits e/o dotazioni di lavoro:', '{/has_benefits}')
    p = clone_after(last, '{^has_benefits}')
    p = clone_after(p, 'Nessuno.')
    clone_after(p, '{/has_benefits}')
    d.save(f'{DST}/contratto_dipendente.docx')


# ---------------- Piano MBO ----------------
def build_mbo():
    d = Document(f'{SRC}/mbo.docx')
    P = all_paragraphs(d)
    repl_any(P, 'Valentina Zezza', '{nome_completo}')
    repl_any(P, 'Francesco Epifani', '{firmatario}')
    repl_any(P, 'Top Management - Esercizio 2026', '{destinatari_label} - Esercizio {anno}')
    repl_any(P, 'per l’esercizio 2026', 'per l’esercizio {anno}')
    repl_any(P, 'Piano MBO 2026', 'Piano MBO {anno}')
    repl_any(P, 'anno solare 2026 (1° gennaio 2026 – 31 dicembre 2026). La valutazione intermedia avverrà entro il 31 luglio 2026; la valutazione finale entro il 28 febbraio 2027.',
             'anno solare {anno} (1° gennaio {anno} – 31 dicembre {anno}). La valutazione intermedia avverrà entro il 31 luglio {anno}; la valutazione finale entro il 28 febbraio {anno_succ}.')
    repl_any(P, 'cedolino del mese di marzo 2027', 'cedolino del mese di marzo {anno_succ}')
    repl_any(P, 'pari al 10% della Retribuzione', 'pari al {mbo_pct}% della Retribuzione')
    repl_any(P, 'Firenze (FI), 03/04/2026', '{luogo_data}')
    t = d.tables[0]
    row = t.rows[1]
    cells = row.cells
    set_text(cells[0].paragraphs[0], '{#obiettivi}{area}')
    set_text(cells[1].paragraphs[0], '{obiettivo}')
    set_text(cells[2].paragraphs[0], '{kpi}')
    set_text(cells[3].paragraphs[0], '{target}')
    set_text(cells[4].paragraphs[0], '{peso}%{/obiettivi}')
    for r in list(t.rows)[2:]:
        t._tbl.remove(r._tr)
    d.save(f'{DST}/mbo.docx')


# ---------------- Lettera di impegno ----------------
def build_impegno():
    d = Document(f'{SRC}/impegno.docx')
    P = all_paragraphs(d)
    repl_any(P, 'Natalia Costi', '{nome_completo}')
    repl_any(P, 'Francesco Epifani', '{firmatario}')
    repl_any(P, 'contratto di lavoro a tempo indeterminato', 'contratto di lavoro a tempo {tipo_contratto}')
    repl_any(P, 'comunque non oltre il 16 novembre 2026', 'comunque non oltre il {data_inizio_max}')
    repl_any(P, 'La prestazione verrà resa presso la sede di Toscana Diagnostica S.r.l., Via di Pratignone, 13/4, 50019 Sesto Fiorentino (FI), o nelle località',
             'La prestazione verrà resa presso la sede di Toscana Diagnostica S.r.l., {sede_lavoro}, o nelle località')
    repl_any(P, 'Sarà assunto con la qualifica di Impiegato di 2° livello con le mansioni di Procurement Manager.',
             'Sarà {assunto} con la qualifica di {qualifica} di {livello_label} con le mansioni di {mansione}.')
    p = find(P, 'Il Suo orario di lavoro di riferimento')
    set_text(p, 'Il Suo orario di lavoro di riferimento sarà pari a {orario_frase} ({ore_settimanali} ore settimanali).{clausola_orario}')
    repl_any(P, 'la Sua retribuzione lorda annua sarà di euro 26.500,00 fino al 31/08/2027. A decorrere dal 1° settembre 2027, la Sua retribuzione lorda annua sarà di euro 28.000,00. Il pagamento',
             'la Sua retribuzione lorda annua sarà di euro {ral}{ral_scatti}.{mbo_frase} Il pagamento')
    repl_any(P, 'Lei potrà essere inviata in trasferta', 'Lei potrà essere {inviata} in trasferta')
    repl_any(P, 'validità sino al 20 luglio 2026', 'validità sino al {validita}')
    repl_any(P, 'Firenze (FI), 08/10/2026', '{luogo_data}')
    d.save(f'{DST}/lettera_impegno.docx')


# ---------------- Contratto libero professionale ----------------
def build_lp():
    d = Document(f'{SRC}/lp_cupelli.docx')
    P = all_paragraphs(d)
    repl_any(P, 'e il prof. Vincenzo Cupelli', 'e {art_titolo} {nome_completo}')
    repl_any(P, 'Firenze (FI), 13/04/2026', '{luogo_data}')
    repl_any(P, 'stipulato il 04/05/2026 in Firenze (FI)', 'stipulato il {data_stipula} in {citta} (FI)')
    repl_any(P, 'con sede in Viale Belfiore, 55, 50144, Firenze (FI), P.IVA', 'con sede in {sede_legale}, P.IVA')
    repl_any(P, 'Il prof. Vincenzo Cupelli, nato il 05/12/1944 a Vallelonga, domiciliato in Firenze, via Trieste 37, Codice fiscale CPLVCN44T05L607Q e P.IVA 06590690480, in possesso di:',
             '{Art_titolo} {nome_completo}, {nato} il {data_nascita} a {luogo_nascita}, {domiciliato} in {residenza}, Codice fiscale {cf} e P.IVA {piva}, in possesso di:')
    p = find(P, 'Laurea in Medicina e Chirurgia conseguita presso Firenze')
    loop_block(p, '{#titoli}', '{.}', '{/titoli}')
    for start in ['Specializzazione in Medicina dello sport', 'Specializzazione in Malattie Cardiovascolari', 'Specializzazione in Medicina del Lavoro']:
        delete(find(P, start))
    repl_any(P, 'Iscrizione all’Ordine Albo Professionale dei Medici Chirurghi al numero 4080 dal 16/02/1970', 'Iscrizione all’{ordine} al numero {ordine_numero} dal {ordine_dal}')
    repl_any(P, 'che il Professionista è iscritto all’Ordine dei Medici di Firenze ed è abilitato', 'che il Professionista è iscritto all’{ordine} ed è abilitato')
    repl_any(P, 'Oggetto della prestazione professionale sarà la consulenza sanitaria negli ambiti per cui il Professionista è abilitato.', 'Oggetto della prestazione professionale sarà {oggetto_prestazione}.')
    p = find(P, 'Oggetto della prestazione professionale sarà')
    p = clone_after(p, '{#attivita}')
    p = clone_after(p, '{.}')
    clone_after(p, '{/attivita}')
    repl_any(P, 'L’inizio dell’incarico è fissato al 04/05/2026 ed avrà scadenza alla data fissata del 03/05/2027.', 'L’inizio dell’incarico è fissato al {data_inizio} ed avrà scadenza alla data fissata del {data_fine}.')
    repl_any(P, 'con preavviso scritto di almeno 30 (trenta) giorni', 'con preavviso scritto di almeno {preavviso} giorni')
    repl_any(P, 'con massimale minimo di €1.000.000,00 (euro un milione/00)', 'con massimale minimo di € {massimale}')
    repl_any(P, 'Il sottoscritto Vincenzo Cupelli, nato il 05/12/1944 a Vallelonga, domiciliato in Firenze, via Trieste 37, presa visione:',
             '{Il_sottoscritto} {nome_completo}, {nato} il {data_nascita} a {luogo_nascita}, {domiciliato} in {residenza}, Codice fiscale {cf}, presa visione:')
    repl_any(P, 'Firenze, lì 13/04/2026', '{citta}, lì {data_lettera}')
    repl_any(P, 'Prof. Vincenzo Cupelli', '{Titolo} {nome_completo}')
    repl_any(P, 'Dott. Francesco Epifani', 'Dott. {firmatario}')
    # Tariffario: tabella con intestazione Codice | Descrizione | Categoria Clinica | Tariffa | Note
    tar = None
    for t in d.tables:
        if t.rows[0].cells[0].text.strip() == 'Codice':
            tar = t
    if tar is None:
        raise SystemExit('Tabella tariffario non trovata')
    row = tar.rows[1]
    cells = row.cells
    set_text(cells[0].paragraphs[0], '{#tariffe}{codice}')
    set_text(cells[1].paragraphs[0], '{descrizione}')
    set_text(cells[2].paragraphs[0], '{categoria}')
    set_text(cells[3].paragraphs[0], '{tariffa}')
    set_text(cells[4].paragraphs[0], '{note}{/tariffe}')
    for r in list(tar.rows)[2:]:
        tar._tbl.remove(r._tr)
    d.save(f'{DST}/contratto_lp.docx')


build_contratto()
build_mbo()
build_impegno()
build_lp()
print('Template generati in', DST)
