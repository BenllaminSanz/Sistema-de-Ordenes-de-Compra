# Pruebas del backend

## Capas

| Capa | Comando | Requiere MySQL |
|------|---------|----------------|
| Unitarias | `npm run test:unit` | No |
| Integración | `npm run test:integration` | Sí (`ordenes_compra_test`) |
| Ambas | `npm run test:all` | Sí (para la parte de integración) |
| E2E | `npm run test:e2e` | Sí (`ordenes_compra_test`) + Chromium |
| CI unit | `npm run test:ci` | No |
| CI full | GitHub Actions (unit + integration job) | Sí (service MySQL) |
| CI E2E | workflow `e2e.yml` (manual / nightly) | Sí + Playwright |

### Integración local

1. MySQL 8 en marcha (el runner usa host/user/pass del `.env` del proyecto).
2. Se crea sola la BD `ordenes_compra_test` y se aplica `fixtures/schema.sql` + `seed.sql`.
3. Password de usuarios seed: `Test1234!`
4. `cd backend && npm run test:integration`

**Nunca** uses una BD sin sufijo `_test` (el guard lo bloquea).

## Requisitos unitarias

- Node.js 18+ (CI usa 22)
- Dependencias: `cd backend && npm install`

No hace falta MySQL ni `.env` de producción. El runner carga `tests/setup-env.js`.

## Variables de test (integración, Fase 2)

Copiar `tests/.env.test.example` a `tests/.env.test` y ajustar.

**Importante:** `DB_NAME` debe terminar en `_test` (protección anti-borrar datos reales).

## Estructura

```
tests/
  setup-env.js      # NODE_ENV=test, claves JWT/crypto
  run.mjs           # descubre *.test.js (Windows/Linux)
  helpers/          # utilidades (dbGuard; Fase 2: factories, auth)
  unit/             # sin BD
  integration/      # API + MySQL _test
  e2e/              # Playwright (Fase 5)
```

## E2E (Fase 5)

Smoke del frontend contra el mismo MySQL de test. No corre en cada PR.

```bash
cd backend
npx playwright install chromium   # una vez
npm run test:e2e
```

El runner levanta `createApp()` en `http://127.0.0.1:3999`, aplica `fixtures/schema.sql` + `seed.sql` y ejecuta:

| Spec | Flujo |
|------|--------|
| E01 | Login sol1 → crear REQ de catálogo → enviar a revisión → logout |
| E02 | Login compras → acuse → aprobar → generar OC → recepción → cierre |
| E03 | sol2 no ve el detalle de un REQ de sol1 |

Usuarios seed: mismos que integración (`Test1234!`).

## Dominio bajo test

Reglas puras en `src/domain/`:

- `roles.js` — normalización y permisos de gestión de usuarios
- `reqEstados.js` — máquina de estados REQ + permisos por rol
- `ocEstados.js` — máquina de estados OC

## Email en tests (Fase 3)

Con `NODE_ENV=test` o `EMAIL_MOCK=1`, `src/config/mailer.js` **no usa red SMTP**.
Los correos se acumulan en memoria:

```js
import { getSentMails, clearSentMails } from './helpers/mail.js';
```

Cubre RFQ a proveedores y la notificación a Compras al pasar un REQ a `en_revision`.

## Cobertura por fases

| Fase | Contenido |
|------|-----------|
| 0–1 | Andamiaje + unitarias de dominio |
| 2 | Auth, REQ, OC, recepciones (P0) |
| 3 | Cotizaciones, RFQ mock, notif. email |
| 4 | Catálogo/proveedores import-export, dashboard/bandejas, SMTP admin |
| 5 | E2E Playwright (smoke UI: login, REQ, OC, IDOR) |
| 6 | Umbral de cobertura unitaria (c8) + tests de v1.8.0 (fechas, notas, notif SMTP) |

## Cobertura (Fase 6)

```bash
cd backend
npm run test:coverage
```

Umbral en `.c8rc.json` sobre dominio, fechas, crypto, schemas y cierre OC. No cubre controladores (eso es integración).

### Suites de integración (Fase 4)

- `catalogo.test.js` — CRUD, roles, import upsert, export con filtro
- `proveedores.test.js` — CRUD, import/export Excel
- `dashboard-bandejas.test.js` — stats por rol, colas de bandeja, fail-closed
- `config-smtp.test.js` — solo admin, password enmascarado, reset a `.env`
