import { one } from '../db.js';
import { config } from '../config.js';
import { forbidden, HttpError } from './util.js';

export class Params {
  constructor() { this.values = []; }
  add(v) { this.values.push(v); return `$${this.values.length}`; }
}

export async function loadUser(req, _res, next) {
  try {
    const id = req.session?.userId;
    if (id) {
      const u = await one(`SELECT id, email, full_name, role, auth_provider, must_change_password, totp_enabled, active FROM users WHERE id=$1`, [id]);
      if (u && u.active) req.user = u;
      else req.session.userId = null;
    }
    next();
  } catch (e) { next(e); }
}

const ONBOARDING_PATHS = ['/api/auth/me', '/api/auth/logout', '/api/auth/change-password', '/api/auth/totp/setup', '/api/auth/totp/enable'];

export function onboardingState(req) {
  const u = req.user;
  if (!u) return null;
  const local = req.session.authMethod === 'LOCAL';
  if (local && u.must_change_password) return 'PASSWORD_CHANGE_REQUIRED';
  if (local && config.requireTotpForAdmins && u.role === 'ADMIN' && !u.totp_enabled) return 'TOTP_SETUP_REQUIRED';
  return null;
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Sessione scaduta o non autenticata'));
  const st = onboardingState(req);
  if (st && !ONBOARDING_PATHS.includes(req.originalUrl.split('?')[0])) {
    const e = new HttpError(403, st === 'PASSWORD_CHANGE_REQUIRED' ? 'Cambio password obbligatorio' : 'Attivazione verifica in due passaggi obbligatoria');
    e.code = st;
    return next(e);
  }
  next();
}

export const requireRole = (...roles) => (req, _res, next) => (roles.includes(req.user?.role) ? next() : next(forbidden()));
// ADMIN e HR possono scrivere; VIEWER è in sola lettura
export const canWrite = (u) => ['ADMIN', 'HR'].includes(u?.role);
export const requireWrite = (req, _res, next) => (canWrite(req.user) ? next() : next(forbidden('Profilo in sola lettura')));
export const isAdmin = (u) => u?.role === 'ADMIN';
