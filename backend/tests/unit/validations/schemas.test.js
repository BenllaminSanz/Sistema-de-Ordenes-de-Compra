import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loginSchema,
  crearRequerimientoSchema,
  cambiarEstadoRequerimientoSchema,
  actualizarUsuarioSchema,
} from '../../../src/validations/schemas.js';

function safeParse(schema, data) {
  return schema.safeParse(data);
}

describe('validations/schemas — loginSchema', () => {
  it('acepta email y password válidos y normaliza email a minúsculas', () => {
    // Nota: z.string().email() corre antes de .trim() en el schema actual,
    // por eso no se envían espacios alrededor del email aquí.
    const r = safeParse(loginSchema, {
      email: 'User@Example.COM',
      password: 'secreto',
    });
    assert.equal(r.success, true);
    assert.equal(r.data.email, 'user@example.com');
  });

  it('rechaza email inválido o password vacío', () => {
    assert.equal(safeParse(loginSchema, { email: 'x', password: 'a' }).success, false);
    assert.equal(safeParse(loginSchema, { email: 'a@b.com', password: '' }).success, false);
  });
});

describe('validations/schemas — crearRequerimientoSchema', () => {
  const base = {
    titulo_solicitud: 'Solicitud de partes de prueba',
  };

  it('acepta solo ítems de catálogo', () => {
    const r = safeParse(crearRequerimientoSchema, {
      ...base,
      items: [{ catalogo_id: 1, cantidad: 2 }],
    });
    assert.equal(r.success, true);
    assert.equal(r.data.items.length, 1);
  });

  it('acepta solo ítems libres', () => {
    const r = safeParse(crearRequerimientoSchema, {
      ...base,
      items_libres: [{ descripcion: 'Tornillo especial', cantidad: 10 }],
    });
    assert.equal(r.success, true);
  });

  it('rechaza mezcla catálogo + libres', () => {
    const r = safeParse(crearRequerimientoSchema, {
      ...base,
      items: [{ catalogo_id: 1, cantidad: 1 }],
      items_libres: [{ descripcion: 'Algo nuevo', cantidad: 1 }],
    });
    assert.equal(r.success, false);
    const msg = r.error.issues.map((i) => i.message).join(' ');
    assert.match(msg, /mezclar/i);
  });

  it('rechaza título demasiado corto', () => {
    const r = safeParse(crearRequerimientoSchema, {
      titulo_solicitud: 'abc',
      items: [{ catalogo_id: 1, cantidad: 1 }],
    });
    assert.equal(r.success, false);
  });

  it('normaliza area/departamento a mayúsculas', () => {
    const r = safeParse(crearRequerimientoSchema, {
      ...base,
      area: 'produccion',
      departamento: 'hilatura',
      items: [{ catalogo_id: 1, cantidad: 1 }],
    });
    assert.equal(r.success, true);
    assert.equal(r.data.area, 'PRODUCCION');
    assert.equal(r.data.departamento, 'HILATURA');
  });
});

describe('validations/schemas — cambiarEstadoRequerimientoSchema', () => {
  it('acepta estados del flujo incluyendo recibido', () => {
    for (const estado of ['en_revision', 'recibido', 'aprobado', 'incompleto', 'rechazado', 'cerrado']) {
      const r = safeParse(cambiarEstadoRequerimientoSchema, { estado });
      assert.equal(r.success, true, estado);
    }
  });

  it('rechaza estado inválido (p. ej. borrador vía PATCH)', () => {
    const r = safeParse(cambiarEstadoRequerimientoSchema, { estado: 'borrador' });
    assert.equal(r.success, false);
  });
});

describe('validations/schemas — actualizarUsuarioSchema', () => {
  it('acepta roles válidos', () => {
    const r = safeParse(actualizarUsuarioSchema, {
      nombre: 'Usuario Test',
      email: 'u@test.local',
      rol: 'compras',
    });
    assert.equal(r.success, true);
  });

  it('rechaza rol inválido', () => {
    const r = safeParse(actualizarUsuarioSchema, {
      nombre: 'Usuario Test',
      email: 'u@test.local',
      rol: 'contabilidad',
    });
    assert.equal(r.success, false);
  });
});
