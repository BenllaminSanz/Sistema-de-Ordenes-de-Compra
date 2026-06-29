import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const wb = XLSX.readFile('Requerimientos 2026.xlsx', { cellStyles: true });
console.log('Hojas:', wb.SheetNames);

for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName];
  if (!ws['!ref']) { console.log(`\n[${sheetName}] vacía`); continue; }

  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const range = XLSX.utils.decode_range(ws['!ref']);
  console.log(`\n===== ${sheetName} — ${data.length - 1} filas de datos =====`);
  console.log('Cabeceras:', JSON.stringify(data[0]));

  // Detectar colores — muestrear primeras 30 filas
  const coloresMuestra = {};
  for (let r = 1; r <= Math.min(30, range.e.r); r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    const fg = cell?.s?.fill?.fgColor;
    if (fg && (fg.rgb || fg.theme !== undefined || fg.indexed !== undefined)) {
      coloresMuestra[`F${r+1}`] = JSON.stringify(fg);
    }
  }
  console.log('Colores (primeras 30 filas):', Object.keys(coloresMuestra).length
    ? coloresMuestra
    : '(ninguno detectado)');

  // Raw de celda A2 para debug de estilos
  const a2 = ws[XLSX.utils.encode_cell({ r: 1, c: 0 })];
  console.log('A2 raw:', JSON.stringify(a2));

  // Primeras 4 filas de datos
  for (let i = 1; i <= Math.min(4, data.length - 1); i++) {
    console.log(`  F${i+1}:`, JSON.stringify(data[i]));
  }
}
