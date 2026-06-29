import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const wb = XLSX.readFile('Requerimientos 2026.xlsx', { cellStyles: true });

for (const sheetName of ['SERVICIOS', 'PARTES']) {
  const ws = wb.Sheets[sheetName];
  if (!ws?.['!ref']) continue;
  const data  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const range = XLSX.utils.decode_range(ws['!ref']);

  console.log(`\n── ${sheetName} — últimas 20 filas ──`);
  const start = Math.max(1, range.e.r - 19);
  for (let r = start; r <= range.e.r; r++) {
    const row = data[r];
    if (!row) continue;
    const allCols = row.slice(0, 12).map(v => String(v ?? '').trim().slice(0, 25));
    if (allCols.every(v => !v)) continue;
    console.log(`  R${r+1}: [${allCols.join(' | ')}]`);
  }
}
