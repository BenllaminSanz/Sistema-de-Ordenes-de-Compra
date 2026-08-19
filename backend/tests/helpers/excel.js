/**
 * Helpers para armar buffers Excel (xlsx) en tests de import.
 */
import XLSX from 'xlsx';

/** Construye un .xlsx en memoria a partir de filas (array de arrays). */
export function buildXlsxBuffer(rows, sheetName = 'Sheet1') {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Lee un buffer xlsx y devuelve filas (AOA). */
export function readXlsxRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}
