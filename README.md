# Toscana Diagnostica · Contracts

Webapp per la gestione, elaborazione e archiviazione dei contratti di lavoro del personale (dipendenti e liberi professionisti), con dossier documentale online e calendario delle scadenze. Destinata a contracts.toscanadiagnostica.it. Stesso stack e stessa interfaccia di cash.toscanadiagnostica.it, sgi e shipment.

## Cosa fa

Inserimento nuova risorsa: percorso guidato. Si sceglie dipendente o libero professionista; per il dipendente, lettera di impegno o contratto di assunzione. Il contratto verifica in automatico se esiste una lettera di impegno accettata e ne recupera tutti i dati (anagrafica, livello, mansione, RAL e scatti, decorrenza). Al salvataggio l'app genera i documenti sui format aziendali in DOCX e PDF: lettera di assunzione (tempo indeterminato o determinato, con scomposizione paga base, superminimo e indennità di funzione, scatti di RAL con decorrenza, benefit, clausola MBO), piano MBO (schema Top Management con tabella obiettivi e pesi), lettera di impegno, contratto di prestazione professionale (titoli, ordine, massimale RC, allegato 1 dichiarazione di non incompatibilità, allegato 2 tariffario con compensi fissi, a ore, a prestazione e variabili sul fatturato). Ogni generazione è versionata e archiviabile nel dossier; il DOCX resta modificabile a mano.

Organigramma (prima voce del menu): struttura da TD-SGI-IDL007 Allegato 1 con viste Direzione, Laboratorio di Analisi, Network Punti Prelievo, Diagnostic Center e organigramma completo; posizioni di staff (C-level, Direttore Sanitario, manager di supporto), sedi da assegnare, nomi collegati automaticamente all'anagrafica (per risorsa o per omonimia), riporti diretti per responsabile, modifica di ogni unità (nome, tipo, responsabile, dipendenza, note), vista "Linee di riporto" ricavata dal campo Responsabile delle schede, allineamento dei responsabili all'organigramma (admin), PDF ufficiale consultabile e aggiornabile, stampa.

Dashboard: risorse attive, sesso, età media, costo annuo e mensile per l'azienda, monte RAL, MBO massimo, organico per area, tipologia contrattuale, livello e disciplina, andamento mensile, scadenze in evidenza, dossier incompleti. Ogni numero e ogni barra è cliccabile e apre l'elenco delle persone del gruppo, da cui si apre la scheda.

Elenco delle risorse (tutte, solo dipendenti, solo LP) con etichetta Dipendente/LP, ricerca, filtri, ordinamento, export Excel dei costi. Scheda della risorsa: anagrafica, rapporto di lavoro o incarico, retribuzione e costo azienda, completezza del dossier rispetto alla checklist documentale, dossier con allegati (categoria, data di rilascio, scadenza, firmato), anteprima PDF e immagini, documenti generati, scadenze, lettere di impegno.

Scouting: CV Box (repository dei CV con sintesi del profilo, area di potenziale destinazione, valutazione e stato; sintesi automatica con API Claude se configurata, altrimenti manuale), lettere di impegno (stesso percorso dell'inserimento), elenco lettere cliccabile con modifica, rigenerazione, cambio stato, conversione in assunzione, eliminazione.

Dipendenti: elenco, CCNL di riferimento (PDF caricabili, paragrafi di sintesi modificabili, minimi tabellari per livello e tranche, tabella RAL e costo azienda, periodi di prova), simulatore busta paga (replica dell'Elaboratore Buste Paga: paga base dal minimo tabellare, indennità di funzione al 70% dell'eccedenza, superminimo; più stima del costo azienda e del netto). Liberi professionisti: elenco e dossier.

Calendario delle scadenze: documenti del dossier con scadenza (albo, polizza RC, identità, formazione sicurezza, ECM), fine periodo di prova, scadenza contratti a termine e apprendistato, scatti di RAL, valutazioni ed erogazione MBO, validità e presa servizio delle lettere di impegno, scadenza e termine di disdetta degli incarichi LP, scadenze manuali.

Profili: amministratore (tutto), HR (inserimento, documenti, dossier, scouting, costi), consultazione (sola lettura senza dati retributivi). Accesso con Microsoft 365 (Entra ID) o email e password con verifica in due passaggi obbligatoria per gli amministratori locali. Registro attività.

## Architettura

- server/: Node.js 22, Express, PostgreSQL 16. API REST, sessioni su database, CSRF, rate limit sul login, audit log. Documenti con docxtemplater sui template in server/src/templates (derivati dai format aziendali), PDF con LibreOffice headless. Allegati e documenti salvati nel database (bytea).
- web/: React 18, Vite, Recharts. Interfaccia in italiano, palette aziendale, responsive.
- Dockerfile unico (frontend buildato e servito dal server, LibreOffice incluso). render.yaml per il deploy Blueprint. docker-compose.yml per installazione su VPS.

## Deploy su Render (GitHub tdpeople/people)

1. render.com, New > Blueprint, collega il repository tdpeople/people: il file render.yaml crea il database (basic-1gb, 16 GB di storage per i dossier) e il servizio web Docker (starter). Il primo build installa LibreOffice: 5-8 minuti.
2. Nel pannello del servizio inserisci SEED_ADMIN_PASSWORD (min 12 caratteri). Al primo accesso l'app chiede di cambiarla e di attivare la verifica in due passaggi.
3. Dominio: Settings > Custom Domains > contracts.toscanadiagnostica.it, poi record CNAME `contracts` verso td-contracts.onrender.com sul DNS. BASE_URL è già impostata: ogni accesso su altri host viene reindirizzato al dominio ufficiale.
4. Impostazioni > Importa pacchetto iniziale: carica i file seed-pack (risorse, contratti, lettere di impegno e dossier estratti dalla cartella OneDrive/HRM). Il pacchetto è consegnato in 10 parti da meno di 30 MB, tutte con lo stesso manifest: si importano una dopo l'altra, in qualunque ordine, con "Salta esistenti"; la prima crea le risorse, le altre aggiungono solo gli allegati. L'import è ripetibile (gli allegati identici sono ignorati).

Costo indicativo: 7 $/mese web + 19 $/mese database (verificare i listini). Il piano free non va bene: il servizio dorme e il database viene cancellato dopo 30 giorni. Memoria: il piano starter (512 MB) regge le conversioni PDF una alla volta (l'app le serializza); se i tempi crescono passare a standard.

## Microsoft 365 (Entra ID)

Serve un Global Administrator del tenant.

1. Entra ID > App registrations > New registration: nome "TD Contracts", account solo di questa organizzazione, piattaforma Web, redirect URI `https://contracts.toscanadiagnostica.it/api/auth/entra/callback` (aggiungere anche `https://td-contracts.onrender.com/api/auth/entra/callback` finché il dominio non è attivo).
2. Certificates & secrets > New client secret (24 mesi): copiare subito il valore.
3. Token configuration > Add optional claim > ID token > `email`.
4. Overview: Directory (tenant) ID e Application (client) ID.
5. Render > Environment: ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET. Riavviare.
6. Ogni utente va censito in Utenti con la stessa email dell'account Microsoft 365 e metodo "Microsoft 365" o "Microsoft 365 o password".

## Sintesi automatica dei CV (facoltativa)

Con ANTHROPIC_API_KEY impostata, al caricamento di un CV in PDF l'app estrae il testo e propone nome, contatti, ruolo, area, valutazione e sintesi del profilo (modificabili). Senza chiave la sintesi si scrive a mano. Il testo del CV viene inviato all'API Anthropic: valutare l'informativa privacy ai candidati.

## Sviluppo locale

```bash
# database (Docker) oppure un PostgreSQL locale
docker run -d --name tdcdb -p 5432:5432 -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=contracts postgres:16-alpine
cd server && npm install
DATABASE_URL=postgres://postgres:dev@localhost:5432/contracts SEED_ADMIN_EMAIL=tu@esempio.it SEED_ADMIN_PASSWORD=Password-Temporanea-1 REQUIRE_TOTP_FOR_ADMINS=false npm start
cd web && npm install && npm run dev   # proxy delle API su :3000
```

Per i PDF in locale serve LibreOffice (`soffice` nel PATH o SOFFICE_BIN). Senza, vengono prodotti solo DOCX.

## Template documentali

I template in server/src/templates sono i format aziendali con i segnaposto docxtemplater (`{nome_completo}`, `{ral}`, loop `{#voci}`, ...). Si rigenerano dai DOCX originali con `python3 tools/build_templates.py <sorgenti> server/src/templates` (python-docx). Per modificare un testo fisso (clausole, allegati) basta aprire il template in Word, rispettando i segnaposto.

Il pacchetto iniziale si costruisce con `python3 tools/build_seed_pack.py <cartella HRM> seed-pack.zip`: le anagrafiche e i dati contrattuali sono codificati nello script (estratti dai contratti DOCX), gli allegati sono mappati per nome file alle categorie del dossier.

## Ipotesi di calcolo

Costo azienda = RAL vigente × coefficiente (1 + INPS datore 29% + INAIL 0,5% + TFR 6,91%; apprendisti INPS 11,61%; dirigenti +8% per FASI/Previndai), modificabile in Impostazioni o per singola risorsa. Il netto è una stima (IRPEF a scaglioni 2025, detrazione lavoro dipendente, addizionali medie). Per i liberi professionisti il costo è la somma dei compensi fissi mensili salvo valore impostato. Tutti i valori economici vanno verificati con il consulente del lavoro.

## API

Tutte sotto /api, sessione via cookie, header `X-Requested-With: td-contracts` sulle richieste che modificano dati.

- auth: config, login, totp, logout, me, change-password, totp/setup, totp/enable, entra/login, entra/callback
- users, settings, areas, work-sites, audit
- resources (GET lista con filtri, POST, GET/PUT/DELETE :id, PUT :id/employment, PUT :id/lp, :id/attachments, :id/deadlines, :id/documents/generate)
- documents/:id (download?format=docx|pdf, archive, DELETE)
- scouting/cv (upload, analyze, download), scouting/letters (CRUD, generate), scouting/letters-accepted
- ccnl (tabelle, sections, minimums, documents, simulate)
- stats/summary, stats/deadlines, stats/costs.xlsx
- org (albero, units CRUD, align-managers, documents)
- import/pack
