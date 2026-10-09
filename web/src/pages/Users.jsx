import React, { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, Card, Field, ErrorBox, Loading, Badge, Modal, useToast } from '../components/ui.jsx';
import { ROLE, ROLE_HELP, itDateTime } from '../format.js';

const PROVIDER = { LOCAL: 'Email e password', ENTRA: 'Microsoft 365', BOTH: 'Microsoft 365 o password' };

export default function Users() {
  const { user } = useAuth();
  const toast = useToast();
  const list = useApi('/users');
  const [edit, setEdit] = useState(null);
  const [temp, setTemp] = useState(null);
  const save = async () => {
    try {
      if (edit.id) { await api.put(`/users/${edit.id}`, { full_name: edit.full_name, role: edit.role, auth_provider: edit.auth_provider, active: edit.active, email: edit.email }); }
      else { const r = await api.post('/users', { email: edit.email, full_name: edit.full_name, role: edit.role, auth_provider: edit.auth_provider, active: true }); if (r.temp_password) setTemp({ email: r.email, pwd: r.temp_password }); }
      setEdit(null); list.reload(); toast('Utente salvato');
    } catch (e) { toast(e.message, 'err'); }
  };
  const reset = async (u) => { try { const r = await api.post(`/users/${u.id}/reset-password`); setTemp({ email: u.email, pwd: r.temp_password }); } catch (e) { toast(e.message, 'err'); } };
  return (
    <div className="page">
      <div className="page-head"><div><h1>Utenti</h1><div className="sub">Chi accede all'applicazione. Gli account Microsoft 365 vanno censiti con la stessa email del tenant.</div></div><button className="btn" onClick={() => setEdit({ email: '', full_name: '', role: 'HR', auth_provider: 'BOTH', active: true })}>+ Nuovo utente</button></div>
      <ErrorBox error={list.error} />
      <Card flush>{!list.data ? <Loading /> : (
        <table className="t"><thead><tr><th>Utente</th><th>Ruolo</th><th>Accesso</th><th>Ultimo accesso</th><th className="num">Azioni</th></tr></thead>
          <tbody>{list.data.map((u) => <tr key={u.id}><td><div className="strong">{u.full_name}</div><div className="small muted">{u.email}</div></td><td><Badge tone={u.role === 'ADMIN' ? 'teal' : u.role === 'HR' ? 'blue' : 'grey'}>{ROLE[u.role]}</Badge> {!u.active && <Badge tone="red">Disattivato</Badge>}</td><td>{PROVIDER[u.auth_provider]}{u.totp_enabled ? <span className="small muted"> · 2FA</span> : ''}</td><td className="small muted">{itDateTime(u.last_login_at) || '–'}</td><td className="num"><button className="btn sm ghost" onClick={() => setEdit(u)}>Modifica</button> {u.auth_provider !== 'ENTRA' && <button className="btn sm ghost" onClick={() => reset(u)}>Reset password</button>}</td></tr>)}</tbody></table>
      )}</Card>
      {edit && <Modal title={edit.id ? 'Modifica utente' : 'Nuovo utente'} onClose={() => setEdit(null)} footer={<><button className="btn ghost" onClick={() => setEdit(null)}>Annulla</button><button className="btn" onClick={save}>Salva</button></>}>
        <div className="form-grid">
          <Field label="Nome e cognome" className="span2"><input value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></Field>
          <Field label="Email" className="span2"><input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
          <Field label="Ruolo" help={ROLE_HELP[edit.role]}><select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} disabled={edit.id === user.id}>{Object.entries(ROLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Metodo di accesso"><select value={edit.auth_provider} onChange={(e) => setEdit({ ...edit, auth_provider: e.target.value })}>{Object.entries(PROVIDER).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          {edit.id && edit.id !== user.id && <Field label="Attivo" className="inline"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> account abilitato</Field>}
        </div>
      </Modal>}
      {temp && <Modal title="Password temporanea" onClose={() => setTemp(null)} footer={<button className="btn" onClick={() => setTemp(null)}>Chiudi</button>}><p>Comunica all'utente <b>{temp.email}</b> la password temporanea (va cambiata al primo accesso):</p><p className="mono" style={{ fontSize: 18, background: 'var(--teal-050)', padding: 12, borderRadius: 8 }}>{temp.pwd}</p></Modal>}
    </div>
  );
}
