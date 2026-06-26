/**
 * Catálogo de departamentos válidos.
 * Fuente: DataTextNow (Accounting Departments) + extras operativos.
 *
 * Cada entrada: { codigo, nombre }
 *   - codigo : clave DataTextNow (string)
 *   - nombre : descripción en español (valor almacenado en BD)
 *
 * El frontend usa `nombre` como value y label de los <option>.
 * El backend valida contra DEPARTAMENTOS_VALIDOS (Set de nombres).
 */

export const DEPARTAMENTOS = [
  // ── Administración / Generales ─────────────────────────────
  { codigo: '00001', grupo: 'Administración',  nombre: 'MATERIAL DE OFICINA' },
  { codigo: '00003', grupo: 'Administración',  nombre: 'EDIFICIOS' },
  { codigo: '00020', grupo: 'Administración',  nombre: 'SUMINISTROS Y EQUIPOS DE COMPUTO' },
  { codigo: '00030', grupo: 'Administración',  nombre: 'SEGURIDAD' },
  { codigo: '00035', grupo: 'Administración',  nombre: 'MEDICAMENTOS' },
  { codigo: '00037', grupo: 'Administración',  nombre: 'RECURSOS HUMANOS' },
  { codigo: '00040', grupo: 'Administración',  nombre: 'HONORARIOS PROFESIONALES' },
  { codigo: '00041', grupo: 'Administración',  nombre: 'SERVICIOS DE COCINA' },
  { codigo: '2460',  grupo: 'Administración',  nombre: 'MATERIAL DE LIMPIEZA' },
  { codigo: '2465',  grupo: 'Administración',  nombre: 'REPARACIÓN DE MONTACARGAS' },
  { codigo: '2480',  grupo: 'Administración',  nombre: 'RENTA DE ALMACEN' },
  { codigo: 'ADM01', grupo: 'Administración',  nombre: 'ADMINISTRACIÓN' },
  { codigo: 'ADM02', grupo: 'Administración',  nombre: 'CAPACITACIÓN' },
  { codigo: 'ADM03', grupo: 'Administración',  nombre: 'SISTEMAS' },
  { codigo: 'ADM04', grupo: 'Administración',  nombre: 'ENFERMERÍA' },
  { codigo: 'ADM05', grupo: 'Administración',  nombre: 'ATENCIÓN A CLIENTES' },

  // ── Producción / Seguridad ─────────────────────────────────
  { codigo: '00006', grupo: 'Producción',      nombre: 'ARTÍCULOS DE SEGURIDAD' },
  { codigo: '00007', grupo: 'Producción',      nombre: 'MATERIAL DE EMPAQUE' },
  { codigo: '00008', grupo: 'Producción',      nombre: 'CERA' },
  { codigo: '00009', grupo: 'Producción',      nombre: 'LABORATORIO' },
  { codigo: '00010', grupo: 'Producción',      nombre: 'SISTEMA CONTRA INCENDIO' },
  { codigo: '00012', grupo: 'Producción',      nombre: 'PROYECTO' },
  { codigo: '00013', grupo: 'Producción',      nombre: 'CHILLER' },
  { codigo: '00014', grupo: 'Producción',      nombre: 'HVAC' },
  { codigo: '00022', grupo: 'Producción',      nombre: 'AIRE COMPRIMIDO' },
  { codigo: '00023', grupo: 'Producción',      nombre: 'TUBOS / CONOS' },
  { codigo: '00034', grupo: 'Producción',      nombre: 'RECOLECCIÓN DE RESIDUOS' },

  // ── OE (Open End) ──────────────────────────────────────────
  { codigo: '3000',  grupo: 'OE',              nombre: 'APERTURA-OE' },
  { codigo: '3010',  grupo: 'OE',              nombre: 'CARDADO-OE' },
  { codigo: '3050',  grupo: 'OE',              nombre: 'ESTIRADO-OE' },
  { codigo: '3070',  grupo: 'OE',              nombre: 'HILATURA-OE' },
  { codigo: '3420',  grupo: 'OE',              nombre: 'MANTENIMIENTO-OE' },

  // ── Polycotton ─────────────────────────────────────────────
  { codigo: '4000',  grupo: 'Polycotton',      nombre: 'APERTURA-POLYCOTTON' },
  { codigo: '4010',  grupo: 'Polycotton',      nombre: 'CARDADO-POLYCOTTON' },
  { codigo: '4050',  grupo: 'Polycotton',      nombre: 'ESTIRADO-POLYCOTTON' },
  { codigo: '4070',  grupo: 'Polycotton',      nombre: 'HILATURA-POLYCOTTON' },
  { codigo: '4420',  grupo: 'Polycotton',      nombre: 'MANTENIMIENTO-POLYCOTTON' },

  // ── RS (Ring Spinning) ─────────────────────────────────────
  { codigo: '5000',  grupo: 'RS',              nombre: 'APERTURA-RS' },
  { codigo: '5010',  grupo: 'RS',              nombre: 'CARDADO-RS' },
  { codigo: '5050',  grupo: 'RS',              nombre: 'ESTIRADO-RS' },
  { codigo: '5060',  grupo: 'RS',              nombre: 'VELOZ-RS' },
  { codigo: '5070',  grupo: 'RS',              nombre: 'HILATURA-RS' },
  { codigo: '5080',  grupo: 'RS',              nombre: 'CONERAS-RS' },
  { codigo: '5420',  grupo: 'RS',              nombre: 'MANTENIMIENTO-RS' },

  // ── Fletes ─────────────────────────────────────────────────
  { codigo: '00032', grupo: 'Fletes',          nombre: 'FLETE POR RETORNO DE INSUMOS' },
  { codigo: '00033', grupo: 'Fletes',          nombre: 'FLETE POR VENTA DE HILO' },
  { codigo: '00036', grupo: 'Fletes',          nombre: 'FLETE POR MATERIALES' },
  { codigo: '00038', grupo: 'Fletes',          nombre: 'FLETE POR MATERIAL DE EMPAQUE' },
  { codigo: '00039', grupo: 'Fletes',          nombre: 'FLETE POR RECOLECCIÓN DE PACAS' },
  { codigo: '3200',  grupo: 'Fletes',          nombre: 'FLETE POR MATERIAL SINTÉTICO' },

  // ── Otros operativos ───────────────────────────────────────
  { codigo: 'OTR01', grupo: 'Otros',           nombre: 'XORELLA' },
  { codigo: 'OTR02', grupo: 'Otros',           nombre: 'RECLAIM' },
];

/** Set de nombres válidos — usado por Zod para validación rápida */
export const DEPARTAMENTOS_VALIDOS = new Set(DEPARTAMENTOS.map(d => d.nombre));

/** Nombres agrupados para construir <optgroup> en el frontend */
export function departamentosPorGrupo() {
  const grupos = {};
  for (const d of DEPARTAMENTOS) {
    if (!grupos[d.grupo]) grupos[d.grupo] = [];
    grupos[d.grupo].push(d);
  }
  return grupos;
}
