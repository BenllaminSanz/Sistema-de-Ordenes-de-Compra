/**
 * Genera Presentacion-Sistema-OC-v1.5.0.pptx
 * Ejecutar: node docs/generar-presentacion-v150.mjs
 */
import PptxGenJS from 'pptxgenjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, 'Presentacion-Sistema-OC-v1.5.0.pptx');

const pptx = new PptxGenJS();
pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
pptx.layout = 'WIDE';
pptx.author = 'Sistema OC';
pptx.title = 'Sistema de Órdenes de Compra v1.5.0';

const C = {
  navy: '0F172A',
  blue: '185FA5',
  blueLt: 'E6F1FB',
  teal: '0F766E',
  tealLt: 'D1FAE5',
  purple: '7C3AED',
  purpleLt: 'EDE9FE',
  amber: 'B45309',
  amberLt: 'FEF3C7',
  white: 'FFFFFF',
  muted: '64748B',
  border: 'E2E8F0',
  dark: '0F172A',
  green: '166534',
  greenBg: 'F0FDF4',
};

function addFooter(slide, page, total = 9) {
  slide.addText('Sistema OC  ·  v1.5.0  ·  Confidencial', {
    x: 0.5, y: 7.1, w: 10, h: 0.25,
    fontSize: 10, color: C.muted, fontFace: 'Calibri',
  });
  slide.addText(`${page} / ${total}`, {
    x: 11.5, y: 7.1, w: 1.3, h: 0.25,
    fontSize: 10, color: C.muted, fontFace: 'Calibri', align: 'right',
  });
}

// ── 1. Portada ───────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.navy } });
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: C.blue } });
  s.addText('SISTEMA DE ÓRDENES DE COMPRA', {
    x: 0.8, y: 2.0, w: 11, h: 0.4,
    fontSize: 14, color: C.blue, fontFace: 'Calibri', bold: true, charSpacing: 3,
  });
  s.addText('Entrega v1.5.0', {
    x: 0.8, y: 2.5, w: 11, h: 0.7,
    fontSize: 36, color: C.white, fontFace: 'Calibri', bold: true,
  });
  s.addText('Carga histórica BASE GRAL · Estados de OC · Operación del día a día', {
    x: 0.8, y: 3.3, w: 11, h: 0.4,
    fontSize: 16, color: '94A3B8', fontFace: 'Calibri',
  });
  s.addText('Presentación a Contabilidad / Operación  ·  Julio 2026', {
    x: 0.8, y: 5.8, w: 11, h: 0.35,
    fontSize: 13, color: '64748B', fontFace: 'Calibri',
  });
}

// ── 2. Objetivo ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: C.blue } });
  s.addText('¿Qué resolvemos con esta entrega?', {
    x: 0.5, y: 0.35, w: 12, h: 0.5,
    fontSize: 24, color: C.dark, fontFace: 'Calibri', bold: true,
  });

  const cards = [
    { t: '1. Plantilla única', d: 'El Excel de Contabilidad (BASE GRAL) es la plantilla oficial de carga de REQ.', c: C.blue, bg: C.blueLt },
    { t: '2. Sin duplicar ni borrar', d: 'Solo se agregan N° que no existen. Lo ya cargado se respeta.', c: C.teal, bg: C.tealLt },
    { t: '3. Cerrar OC en lote', d: 'El archivo de estados actualiza Cerrada / Distribuida / Parcial / Cancelada.', c: C.purple, bg: C.purpleLt },
    { t: '4. Ver lo pendiente', d: 'Filtros de activos y dashboard para no perderse entre cientos de cerradas.', c: C.amber, bg: C.amberLt },
  ];
  cards.forEach((card, i) => {
    const x = 0.5 + (i % 2) * 6.3;
    const y = 1.15 + Math.floor(i / 2) * 2.6;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y, w: 6.0, h: 2.3,
      fill: { color: card.bg }, rectRadius: 0.1,
    });
    s.addShape(pptx.shapes.RECTANGLE, { x, y, w: 0.12, h: 2.3, fill: { color: card.c } });
    s.addText(card.t, {
      x: x + 0.35, y: y + 0.4, w: 5.4, h: 0.45,
      fontSize: 18, color: card.c, fontFace: 'Calibri', bold: true,
    });
    s.addText(card.d, {
      x: x + 0.35, y: y + 1.0, w: 5.4, h: 0.9,
      fontSize: 14, color: C.dark, fontFace: 'Calibri',
    });
  });
  addFooter(s, 2);
}

// ── 3. Plantilla Excel ───────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: C.blue } });
  s.addText('Plantilla Excel BASE GRAL', {
    x: 0.5, y: 0.35, w: 12, h: 0.45,
    fontSize: 24, color: C.dark, fontFace: 'Calibri', bold: true,
  });
  s.addText('Mismo orden de trabajo de Contabilidad — una hoja o por tipo', {
    x: 0.5, y: 0.85, w: 12, h: 0.3,
    fontSize: 13, color: C.muted, fontFace: 'Calibri',
  });

  const headers = ['PO DTN', 'Fecha', 'N°', 'Fecha sol.', 'Tipo', 'Proveedor', '…', 'Estado', 'Status'];
  const sample = ['310005467', '19/02/26', '2026P-214', '12/02/26', 'PARTES', '155-RIETER…', '…', 'Cerrada', 'Agregada a OC'];
  headers.forEach((h, i) => {
    const x = 0.4 + i * 1.4;
    s.addShape(pptx.shapes.RECTANGLE, {
      x, y: 1.5, w: 1.35, h: 0.45,
      fill: { color: C.navy },
    });
    s.addText(h, {
      x, y: 1.55, w: 1.35, h: 0.35,
      fontSize: 10, color: C.white, fontFace: 'Calibri', bold: true, align: 'center',
    });
    s.addShape(pptx.shapes.RECTANGLE, {
      x, y: 1.95, w: 1.35, h: 0.5,
      fill: { color: i === 0 || i === 7 ? C.blueLt : 'F8FAFC' },
      line: { color: C.border, width: 0.5 },
    });
    s.addText(sample[i], {
      x, y: 2.0, w: 1.35, h: 0.4,
      fontSize: 9, color: C.dark, fontFace: 'Calibri', align: 'center',
    });
  });

  const rules = [
    { t: 'Sufijos A / B / C', d: 'Válidos: un mismo REQ partido en varias OC (ej. 2026S-277A).' },
    { t: 'Estado', d: 'Cerrada · Distribuida · Parcial · Cancelada · En revisión · Aprobado' },
    { t: 'Status', d: 'Bitácora libre (notas); no es el estado del sistema.' },
    { t: 'Import normal', d: 'Solo inserta N° nuevos. No actualiza ni borra existentes.' },
  ];
  rules.forEach((r, i) => {
    const y = 2.8 + i * 0.9;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.5, y, w: 12.3, h: 0.8,
      fill: { color: 'F8FAFC' }, rectRadius: 0.06,
      line: { color: C.border, width: 0.5 },
    });
    s.addText(r.t, {
      x: 0.7, y: y + 0.15, w: 3.2, h: 0.5,
      fontSize: 14, color: C.blue, fontFace: 'Calibri', bold: true, valign: 'middle',
    });
    s.addText(r.d, {
      x: 4.0, y: y + 0.15, w: 8.5, h: 0.5,
      fontSize: 13, color: C.dark, fontFace: 'Calibri', valign: 'middle',
    });
  });
  addFooter(s, 3);
}

// ── 4. Estados OC ────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: C.blue } });
  s.addText('Estados de la Orden de Compra', {
    x: 0.5, y: 0.35, w: 12, h: 0.45,
    fontSize: 24, color: C.dark, fontFace: 'Calibri', bold: true,
  });
  s.addText('Mapeo del Excel de Contabilidad → sistema (archivo de sincronización de estados)', {
    x: 0.5, y: 0.85, w: 12, h: 0.3,
    fontSize: 13, color: C.muted, fontFace: 'Calibri',
  });

  const map = [
    { excel: 'Cerrada', sys: 'cerrada', note: 'Concluida', color: '166534', bg: 'DCFCE7' },
    { excel: 'Distribuida', sys: 'distribuida', note: 'Activa / en camino', color: '1E40AF', bg: 'DBEAFE' },
    { excel: 'Parcial', sys: 'en_proceso', note: 'Entrega incompleta', color: C.amber, bg: C.amberLt },
    { excel: 'Cancelada', sys: 'cancelada / REQ rechazado', note: 'No sigue', color: '991B1B', bg: 'FEE2E2' },
  ];
  map.forEach((m, i) => {
    const x = 0.5 + i * 3.15;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.5, w: 3.0, h: 3.6,
      fill: { color: C.white },
      line: { color: C.border, width: 1 },
      rectRadius: 0.1,
    });
    s.addShape(pptx.shapes.RECTANGLE, { x, y: 1.5, w: 3.0, h: 0.12, fill: { color: m.color } });
    s.addText('Excel', {
      x: x + 0.2, y: 1.85, w: 2.6, h: 0.3,
      fontSize: 11, color: C.muted, fontFace: 'Calibri',
    });
    s.addText(m.excel, {
      x: x + 0.2, y: 2.2, w: 2.6, h: 0.45,
      fontSize: 18, color: C.dark, fontFace: 'Calibri', bold: true,
    });
    s.addText('→', {
      x: x + 0.2, y: 2.8, w: 2.6, h: 0.35,
      fontSize: 20, color: C.muted, fontFace: 'Calibri', align: 'center',
    });
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: x + 0.25, y: 3.3, w: 2.5, h: 0.55,
      fill: { color: m.bg }, rectRadius: 0.08,
    });
    s.addText(m.sys, {
      x: x + 0.25, y: 3.35, w: 2.5, h: 0.45,
      fontSize: 12, color: m.color, fontFace: 'Calibri', bold: true, align: 'center', valign: 'middle',
    });
    s.addText(m.note, {
      x: x + 0.2, y: 4.2, w: 2.6, h: 0.5,
      fontSize: 12, color: C.muted, fontFace: 'Calibri', align: 'center',
    });
  });
  s.addText('La sincronización de estados no borra datos: actualiza OC existentes por N° (consecutivo).', {
    x: 0.5, y: 5.5, w: 12.3, h: 0.4,
    fontSize: 13, color: C.dark, fontFace: 'Calibri',
  });
  s.addText('Ejemplo local: ~1 201 OC pasaron de distribuida → cerrada; 76 Parcial → en_proceso.', {
    x: 0.5, y: 5.95, w: 12.3, h: 0.35,
    fontSize: 12, color: C.muted, fontFace: 'Calibri',
  });
  addFooter(s, 4);
}

// ── 5. Números ───────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: C.blue } });
  s.addText('Resultado en ambiente de validación', {
    x: 0.5, y: 0.35, w: 12, h: 0.45,
    fontSize: 24, color: C.dark, fontFace: 'Calibri', bold: true,
  });
  s.addText('Cifras locales post-carga + sincronización de estados (referencia)', {
    x: 0.5, y: 0.85, w: 12, h: 0.3,
    fontSize: 13, color: C.muted, fontFace: 'Calibri',
  });

  const kpis = [
    { n: '~1 921', l: 'Requerimientos', s: 'Histórico BASE GRAL' },
    { n: '~1 708', l: 'Órdenes de compra', s: 'Con PO / N°' },
    { n: '~1 382', l: 'OC cerradas', s: 'Alineadas al Excel (1)' },
    { n: '~326', l: 'OC activas', s: '250 distrib. + 76 parcial' },
  ];
  kpis.forEach((k, i) => {
    const x = 0.5 + i * 3.15;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.5, w: 3.0, h: 2.4,
      fill: { color: C.white },
      line: { color: C.border, width: 1 },
      rectRadius: 0.1,
    });
    s.addText(k.n, {
      x: x + 0.15, y: 1.85, w: 2.7, h: 0.7,
      fontSize: 28, color: C.blue, fontFace: 'Calibri', bold: true, align: 'center',
    });
    s.addText(k.l, {
      x: x + 0.15, y: 2.65, w: 2.7, h: 0.4,
      fontSize: 14, color: C.dark, fontFace: 'Calibri', bold: true, align: 'center',
    });
    s.addText(k.s, {
      x: x + 0.15, y: 3.15, w: 2.7, h: 0.4,
      fontSize: 12, color: C.muted, fontFace: 'Calibri', align: 'center',
    });
  });

  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: 4.3, w: 12.3, h: 2.2,
    fill: { color: C.greenBg }, rectRadius: 0.1,
  });
  s.addText('Para el día a día', {
    x: 0.8, y: 4.55, w: 11.7, h: 0.4,
    fontSize: 16, color: C.green, fontFace: 'Calibri', bold: true,
  });
  s.addText([
    { text: 'Filtro OC “Activas / no concluidas” → solo las ~326 abiertas (no se mezclan las cerradas).\n', options: { breakLine: false } },
    { text: 'Filtro REQ “Activos / no cerrados” → revisión, aprobado, etc. (excluye cerrado).\n', options: { breakLine: false } },
    { text: 'Dashboard muestra desglose de activas y áreas reales del Excel.', options: { breakLine: false } },
  ], {
    x: 0.8, y: 5.1, w: 11.7, h: 1.2,
    fontSize: 14, color: C.dark, fontFace: 'Calibri',
  });
  addFooter(s, 5);
}

// ── 6. Mejoras de uso ────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: C.blue } });
  s.addText('Mejoras de usabilidad en listados', {
    x: 0.5, y: 0.35, w: 12, h: 0.45,
    fontSize: 24, color: C.dark, fontFace: 'Calibri', bold: true,
  });

  const items = [
    { num: '01', t: 'Columnas OC como en el Excel', d: 'PO DTN → Fecha PO → Requerimiento → No. OC. Anchos pensados para PO de longitud fija (~9 dígitos).' },
    { num: '02', t: 'Paginación fija abajo', d: 'Al cambiar de página, la barra se mantiene al pie de la pantalla. No hay que subir y bajar cada vez.' },
    { num: '03', t: 'Filtros de pendientes', d: 'REQ y OC: un clic para ver solo lo no concluido. Ideal cuando hay “huecos” entre consecutivos y muchas cerradas en medio.' },
    { num: '04', t: 'Dashboard operativo', d: 'OC activas con desglose, top por área, pendientes de revisión/aprobado, gasto MXN + otras monedas.' },
  ];
  items.forEach((it, i) => {
    const y = 1.1 + i * 1.35;
    s.addShape(pptx.shapes.OVAL, {
      x: 0.55, y: y + 0.15, w: 0.7, h: 0.7,
      fill: { color: C.blueLt },
    });
    s.addText(it.num, {
      x: 0.55, y: y + 0.28, w: 0.7, h: 0.45,
      fontSize: 14, color: C.blue, fontFace: 'Calibri', bold: true, align: 'center',
    });
    s.addText(it.t, {
      x: 1.5, y: y + 0.1, w: 11, h: 0.4,
      fontSize: 16, color: C.dark, fontFace: 'Calibri', bold: true,
    });
    s.addText(it.d, {
      x: 1.5, y: y + 0.55, w: 11, h: 0.55,
      fontSize: 13, color: C.muted, fontFace: 'Calibri',
    });
  });
  addFooter(s, 6);
}

// ── 7. Cómo se usa ───────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: C.blue } });
  s.addText('Proceso en el servidor (día a día)', {
    x: 0.5, y: 0.35, w: 12, h: 0.45,
    fontSize: 24, color: C.dark, fontFace: 'Calibri', bold: true,
  });

  const steps = [
    { n: '1', t: 'Exportar / armar Excel', d: 'Plantilla BASE GRAL con N°, PO, Estado y Status actualizados.' },
    { n: '2', t: 'Importar en Requerimientos', d: 'Botón “Importar Excel”. Solo entran N° nuevos. Resumen de omitidos.' },
    { n: '3', t: 'Si hay cierres masivos', d: 'Sync de estados OC con el archivo que trae Cerrada / Parcial (equipo técnico o script acordado).' },
    { n: '4', t: 'Operar con filtros', d: 'Activos en REQ y Activas en OC. REQ nuevos de la semana por el sistema.' },
  ];
  steps.forEach((st, i) => {
    const x = 0.45 + i * 3.2;
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.3, w: 3.05, h: 4.2,
      fill: { color: i === 2 ? C.amberLt : C.white },
      line: { color: C.border, width: 1 },
      rectRadius: 0.1,
    });
    s.addShape(pptx.shapes.OVAL, {
      x: x + 1.05, y: 1.6, w: 0.9, h: 0.9,
      fill: { color: C.blue },
    });
    s.addText(st.n, {
      x: x + 1.05, y: 1.75, w: 0.9, h: 0.65,
      fontSize: 22, color: C.white, fontFace: 'Calibri', bold: true, align: 'center',
    });
    s.addText(st.t, {
      x: x + 0.2, y: 2.8, w: 2.65, h: 0.8,
      fontSize: 15, color: C.dark, fontFace: 'Calibri', bold: true, align: 'center',
    });
    s.addText(st.d, {
      x: x + 0.2, y: 3.7, w: 2.65, h: 1.4,
      fontSize: 12, color: C.muted, fontFace: 'Calibri', align: 'center',
    });
  });
  addFooter(s, 7);
}

// ── 8. Pendientes ────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: C.blue } });
  s.addText('Siguiente y fuera de alcance de esta entrega', {
    x: 0.5, y: 0.35, w: 12, h: 0.45,
    fontSize: 24, color: C.dark, fontFace: 'Calibri', bold: true,
  });

  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: 1.2, w: 6.0, h: 5.0,
    fill: { color: C.greenBg }, rectRadius: 0.1,
  });
  s.addText('Siguiente', {
    x: 0.8, y: 1.5, w: 5.4, h: 0.4,
    fontSize: 16, color: C.green, fontFace: 'Calibri', bold: true,
  });
  s.addText([
    { text: 'Visto bueno de esta demo\n', options: { bullet: false } },
    { text: 'Deploy v1.5.0 en servidor del cliente\n', options: { bullet: false } },
    { text: 'Backup + carga/sync controlada en prod\n', options: { bullet: false } },
    { text: 'REQ reales de la semana por el sistema\n', options: { bullet: false } },
    { text: 'Depurar “en revisión” históricos si aplica', options: { bullet: false } },
  ].map((t) => ({ text: '•  ' + t.text.replace(/\n$/, '') + '\n', options: { breakLine: false } })), {
    x: 0.8, y: 2.2, w: 5.4, h: 3.5,
    fontSize: 14, color: C.dark, fontFace: 'Calibri',
  });

  s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: 6.8, y: 1.2, w: 6.0, h: 5.0,
    fill: { color: 'F8FAFC' },
    line: { color: C.border, width: 1 },
    rectRadius: 0.1,
  });
  s.addText('Más adelante (acordado)', {
    x: 7.1, y: 1.5, w: 5.4, h: 0.4,
    fontSize: 16, color: C.muted, fontFace: 'Calibri', bold: true,
  });
  s.addText([
    { text: '•  Layout de alta de productos / catálogo\n' },
    { text: '•  Ajustes finos de áreas vs departamentos\n' },
    { text: '•  Reportes adicionales si Contabilidad los pide\n' },
  ], {
    x: 7.1, y: 2.2, w: 5.4, h: 3.5,
    fontSize: 14, color: C.dark, fontFace: 'Calibri',
  });
  addFooter(s, 8);
}

// ── 9. Cierre ────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.navy } });
  s.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: C.blue } });
  s.addText('Listos para validar en demo', {
    x: 0.8, y: 2.4, w: 11.5, h: 0.6,
    fontSize: 28, color: C.white, fontFace: 'Calibri', bold: true,
  });
  s.addText('Plantilla BASE GRAL · Cierre de OC · Filtros de pendientes · Dashboard usable', {
    x: 0.8, y: 3.2, w: 11.5, h: 0.4,
    fontSize: 15, color: '94A3B8', fontFace: 'Calibri',
  });
  s.addText('¿Preguntas o ajustes antes del deploy al servidor?', {
    x: 0.8, y: 4.2, w: 11.5, h: 0.4,
    fontSize: 16, color: C.blue, fontFace: 'Calibri',
  });
  s.addText('Sistema OC  ·  v1.5.0  ·  Julio 2026', {
    x: 0.8, y: 6.3, w: 11.5, h: 0.3,
    fontSize: 12, color: '64748B', fontFace: 'Calibri',
  });
}

await pptx.writeFile({ fileName: out });
console.log('OK →', out);
