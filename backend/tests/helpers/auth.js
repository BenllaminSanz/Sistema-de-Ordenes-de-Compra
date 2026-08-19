import jwt from 'jsonwebtoken';
import request from 'supertest';
import { getApp } from './app.js';

/** Password de los usuarios del seed */
export const TEST_PASSWORD = 'Test1234!';

export const USERS = {
  admin: { id: 1, email: 'admin@test.local', rol: 'admin', nombre: 'Admin Test' },
  compras: { id: 2, email: 'compras@test.local', rol: 'compras', nombre: 'Compras Test' },
  sol1: { id: 3, email: 'sol1@test.local', rol: 'solicitante', nombre: 'Solicitante Uno' },
  sol2: { id: 4, email: 'sol2@test.local', rol: 'solicitante', nombre: 'Solicitante Dos' },
  inactivo: { id: 5, email: 'inactivo@test.local', rol: 'solicitante', nombre: 'Inactivo Test' },
  noverif: { id: 6, email: 'noverif@test.local', rol: 'solicitante', nombre: 'No Verificado' },
};

/** JWT firmado (rápido; no pasa por bcrypt). */
export function tokenFor(userKeyOrUser) {
  const u = typeof userKeyOrUser === 'string' ? USERS[userKeyOrUser] : userKeyOrUser;
  if (!u) throw new Error(`Usuario de test desconocido: ${userKeyOrUser}`);
  return jwt.sign(
    { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
}

export function authHeader(userKeyOrUser) {
  return { Authorization: `Bearer ${tokenFor(userKeyOrUser)}` };
}

/** Login real vía API (ejercita bcrypt). */
export async function loginAs(email, password = TEST_PASSWORD) {
  const { ensureApp } = await import('./app.js');
  const app = await ensureApp();
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  return res;
}

export function agentFor(userKey) {
  const app = getApp();
  const token = tokenFor(userKey);
  return {
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    put: (url) => request(app).put(url).set('Authorization', `Bearer ${token}`),
    patch: (url) => request(app).patch(url).set('Authorization', `Bearer ${token}`),
    delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  };
}
