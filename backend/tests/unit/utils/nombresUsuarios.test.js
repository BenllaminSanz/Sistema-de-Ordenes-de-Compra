import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarNombre,
  tokensNombre,
  tokensEquivalentes,
  tokensContenidosEn,
  nombreMasCompleto,
  elegirCanonicaYDuplicado,
  detectarParesNombres,
  planRevertirNombresCortos,
  esEmailImport,
} from '../../../src/utils/nombresUsuarios.js';

describe('nombresUsuarios — normalizar / tokens', () => {
  it('quita acentos y colapsa espacios', () => {
    assert.equal(normalizarNombre('  José  Isaí  '), 'jose isai');
    assert.deepEqual(tokensNombre('David Yañez'), ['david', 'yanez']);
  });

  it('ignora partículas cortas', () => {
    assert.deepEqual(tokensNombre('Ana de la Cruz'), ['ana', 'cruz']);
  });
});

describe('nombresUsuarios — equivalencia de tokens', () => {
  it('acepta typo de 1 letra en palabras largas', () => {
    assert.equal(tokensEquivalentes('lisbeth', 'lizbeth'), true);
    assert.equal(tokensEquivalentes('camacho', 'camacho'), true);
  });

  it('no mezcla apellidos distintos', () => {
    assert.equal(tokensEquivalentes('camacho', 'ocampo'), false);
    assert.equal(tokensEquivalentes('santos', 'salas'), false);
    assert.equal(tokensEquivalentes('juan', 'jose'), false);
  });
});

describe('nombresUsuarios — contenido corto en largo', () => {
  it('Juan Camacho ⊂ Juan Manuel Camacho Herrera', () => {
    const corto = tokensNombre('Juan Camacho');
    const largo = tokensNombre('Juan Manuel Camacho Herrera');
    assert.equal(tokensContenidosEn(corto, largo), true);
    assert.equal(tokensContenidosEn(largo, corto), false);
  });

  it('no empareja Juan Camacho con Juan Ocampo', () => {
    assert.equal(
      tokensContenidosEn(tokensNombre('Juan Camacho'), tokensNombre('Juan Ocampo')),
      false
    );
  });

  it('Lisbeth Linares ⊂ Elda Lizbeth Linares (s/z)', () => {
    assert.equal(
      tokensContenidosEn(
        tokensNombre('Lisbeth Linares'),
        tokensNombre('Elda Lizbeth Linares')
      ),
      true
    );
  });
});

describe('nombresUsuarios — nombre más completo', () => {
  it('prefiere más apellidos', () => {
    assert.equal(
      nombreMasCompleto('Jorge Lara', 'Jorge Alejandro Lara Velez'),
      'Jorge Alejandro Lara Velez'
    );
  });
});

describe('nombresUsuarios — canónica vs duplicado', () => {
  it('prefiere activo con correo real sobre placeholder import', () => {
    const real = { id: 9, nombre: 'Juan Camacho', email: 'juan.camacho@x.com', activo: 1, n_req: 91 };
    const imp = { id: 27, nombre: 'Juan Manuel Camacho Herrera', email: 'sin-correo.x@import.local', activo: 0, n_req: 0 };
    const { canonica, duplicado, omitir } = elegirCanonicaYDuplicado(real, imp);
    assert.equal(omitir, null);
    assert.equal(canonica.id, 9);
    assert.equal(duplicado.id, 27);
  });

  it('no fusiona dos cuentas activas con correo real', () => {
    const a = { id: 8, nombre: 'Juan Ocampo', email: 'juan.ocampo@x.com', activo: 1, n_req: 10 };
    const b = { id: 9, nombre: 'Juan Camacho', email: 'juan.camacho@x.com', activo: 1, n_req: 10 };
    const { omitir } = elegirCanonicaYDuplicado(a, b);
    assert.equal(omitir, 'ambos_activos');
  });

  it('detecta placeholders de import', () => {
    assert.equal(esEmailImport('sin-correo.juan@import.local'), true);
    assert.equal(esEmailImport('juan.ocampo@parkdalemills.com'), false);
  });
});

describe('nombresUsuarios — detectarParesNombres (datos reales)', () => {
  const usuarios = [
    { id: 15, nombre: 'Dulce Velazquez', email: 'dulce.velazquez@x.com', activo: 1, n_req: 6 },
    { id: 28, nombre: 'Dulce Amaranta Velazquez', email: 'sin-correo.dulce@import.local', activo: 0, n_req: 0 },
    { id: 4, nombre: 'Jorge Lara', email: 'jorge.lara@x.com', activo: 1, n_req: 33 },
    { id: 25, nombre: 'Jorge Alejandro Lara Velez', email: 'sin-correo.jorge@import.local', activo: 0, n_req: 0 },
    { id: 6, nombre: 'Jose Isai Fonseca', email: 'jose.fonseca@x.com', activo: 1, n_req: 236 },
    { id: 26, nombre: 'Jose Isai Fonseca Vivas', email: 'sin-correo.jose@import.local', activo: 0, n_req: 0 },
    { id: 7, nombre: 'Jose Luis Santos', email: 'jluis.santos@x.com', activo: 1, n_req: 35 },
    { id: 9, nombre: 'Juan Camacho', email: 'juan.camacho@x.com', activo: 1, n_req: 91 },
    { id: 27, nombre: 'Juan Manuel Camacho Herrera', email: 'sin-correo.juan.m@import.local', activo: 0, n_req: 0 },
    { id: 8, nombre: 'Juan Ocampo', email: 'juan.ocampo@x.com', activo: 1, n_req: 167 },
    { id: 24, nombre: 'Juan Carlos Ocampo Reyna', email: 'sin-correo.juan.c@import.local', activo: 0, n_req: 0 },
    { id: 16, nombre: 'Lisbeth Linares', email: 'lisbeth.linares@x.com', activo: 1, n_req: 0 },
    { id: 21, nombre: 'Elda Lizbeth Linares', email: 'elda.linares@x.com', activo: 0, n_req: 14 },
    { id: 2, nombre: 'Adrian Velarde', email: 'adrian.velarde@x.com', activo: 1, n_req: 397 },
  ];

  it('arma los 6 pares cortos vs completos y no mezcla Juans ni Joses', () => {
    const { pares, omitidos } = detectarParesNombres(usuarios);
    const ids = pares
      .map((p) => [p.canonica.id, p.duplicado.id].sort((a, b) => a - b).join('-'))
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    assert.deepEqual(ids, [
      '4-25',
      '6-26',
      '8-24',
      '9-27',
      '15-28',
      '16-21',
    ]);
    assert.equal(omitidos.length, 0);
  });

  it('conserva el nombre corto de la cuenta de login', () => {
    const { pares } = detectarParesNombres(usuarios);
    const camacho = pares.find((p) => p.canonica.id === 9);
    assert.equal(camacho.canonica.nombre, 'Juan Camacho');
    assert.equal(camacho.nombreNuevo, 'Juan Camacho');
    assert.equal(camacho.duplicado.nombre, 'Juan Manuel Camacho Herrera');
    const lisbeth = pares.find((p) => p.canonica.id === 16);
    assert.equal(lisbeth.nombreNuevo, 'Lisbeth Linares');
    assert.equal(lisbeth.duplicado.id, 21);
  });

  it('revierte nombres alargados por error al corto de operación', () => {
    const yaLargos = [
      { id: 9, nombre: 'Juan Manuel Camacho Herrera', email: 'juan.camacho@parkdalemills.com', activo: 1 },
      { id: 16, nombre: 'Elda Lizbeth Linares', email: 'lisbeth.linares@parkdalemills.com', activo: 1 },
      { id: 8, nombre: 'Juan Ocampo', email: 'juan.ocampo@parkdalemills.com', activo: 1 },
    ];
    const plan = planRevertirNombresCortos(yaLargos);
    const porEmail = Object.fromEntries(plan.map((p) => [p.email, p.nombreNuevo]));
    assert.equal(porEmail['juan.camacho@parkdalemills.com'], 'Juan Camacho');
    assert.equal(porEmail['lisbeth.linares@parkdalemills.com'], 'Lisbeth Linares');
    assert.equal(porEmail['juan.ocampo@parkdalemills.com'], undefined);
  });

  it('omite si un corto coincide con dos largos (homónimo)', () => {
    const set = [
      { id: 1, nombre: 'Juan Perez', email: 'a@x.com', activo: 1, n_req: 1 },
      { id: 2, nombre: 'Juan Perez Garcia', email: 'b@import.local', activo: 0, n_req: 0 },
      { id: 3, nombre: 'Juan Perez Lopez', email: 'c@import.local', activo: 0, n_req: 0 },
    ];
    const { pares, omitidos } = detectarParesNombres(set);
    assert.equal(pares.length, 0);
    assert.ok(omitidos.length >= 1);
    assert.ok(omitidos.every((o) => o.omitir === 'ambiguo'));
  });

  it('es idempotente si los nombres ya están completos y no hay duplicado', () => {
    const ya = [
      { id: 9, nombre: 'Juan Manuel Camacho Herrera', email: 'juan.camacho@x.com', activo: 1, n_req: 91 },
      { id: 8, nombre: 'Juan Carlos Ocampo Reyna', email: 'juan.ocampo@x.com', activo: 1, n_req: 167 },
    ];
    const { pares } = detectarParesNombres(ya);
    assert.equal(pares.length, 0);
  });

  it('no reabre un par ya unificado (mismo nombre, 0 REQ, correo real)', () => {
    const ya = [
      { id: 16, nombre: 'Elda Lizbeth Linares', email: 'lisbeth.linares@x.com', activo: 1, n_req: 14 },
      { id: 21, nombre: 'Elda Lizbeth Linares', email: 'elda.linares@x.com', activo: 0, n_req: 0 },
    ];
    const { pares } = detectarParesNombres(ya);
    assert.equal(pares.length, 0);
  });
});
