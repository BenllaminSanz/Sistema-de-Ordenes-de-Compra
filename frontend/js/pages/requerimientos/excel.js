// ── EXPORT / IMPORT EXCEL ────────────────────────────────────────────────────

async function exportarRequerimientos(btn) {
  Reportes.solicitarPeriodoExportacion({
    titulo: 'Exportar requerimientos',
    btn,
    alConfirmar: ({ modo, anio }, boton) => descargarRequerimientosExcel(boton, modo, anio),
  });
}

async function descargarRequerimientosExcel(btn, modo, anio) {
  const params = modo === 'anio' ? `?anio=${encodeURIComponent(anio)}` : '';
  if (window.ExcelUI?.descargar) {
    await ExcelUI.descargar(`/requerimientos/exportar${params}`, {
      btn,
      successMsg: `BASE GRAL de requerimientos ${modo === 'anio' ? `de ${anio}` : 'completo'} descargado`,
      loadingText: 'Generando…',
    });
    return;
  }
  // Fallback sin ExcelUI
  try {
    setButtonLoading?.(btn, true, 'Generando…');
    const response = await fetch(`/api/requerimientos/exportar${params}`, {
      headers: { Authorization: `Bearer ${Auth.getToken()}` },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.mensaje || 'Error al exportar');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BASE_GRAL_REQ_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    Toast?.success?.('Excel descargado');
  } catch (err) {
    Toast?.error?.(err.message) || alert('Error al exportar: ' + err.message);
  } finally {
    setButtonLoading?.(btn, false);
  }
}

function imp_preview(input) {
  const file    = input.files?.[0];
  const preview = document.getElementById('imp-preview');
  const nombre  = document.getElementById('imp-nombre');
  const res     = document.getElementById('imp-resultado');
  if (!file) { preview.style.display = 'none'; return; }
  preview.style.display = 'block';
  nombre.textContent    = `${file.name}  (${(file.size / 1024).toFixed(0)} KB)`;
  res.style.display     = 'none';
  res.innerHTML         = '';
}

async function ejecutarImport() {
  const fileInput = document.getElementById('imp-archivo');
  const resultado = document.getElementById('imp-resultado');
  const btn       = document.getElementById('imp-btn-importar');

  if (!fileInput?.files?.length) {
    alert('Selecciona un archivo Excel primero');
    return;
  }

  const original  = btn.textContent;
  btn.disabled    = true;
  btn.textContent = 'Importando…';
  resultado.style.display = 'none';
  resultado.innerHTML     = '';

  try {
    const formData = new FormData();
    formData.append('archivo', fileInput.files[0]);

    const response = await fetch('/api/requerimientos/importar', {
      method:  'POST',
      headers: { Authorization: `Bearer ${Auth.getToken()}` },
      body:    formData,
    });

    const data = await response.json();

    if (!response.ok) {
      resultado.className    = '';
      resultado.style.cssText = 'display:block;background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:10px 14px;font-size:13px;line-height:1.5;margin-top:14px;color:#991b1b';
      resultado.innerHTML    = `<strong>Error:</strong> ${data.mensaje || 'Error desconocido'}`;
      return;
    }

    const color = data.importados > 0 ? '#f0fdf4' : '#f8fafc';
    const borde = data.importados > 0 ? '#86efac' : '#e2e8f0';
    const texto = data.importados > 0 ? '#166534' : '#475569';
    resultado.style.cssText = `display:block;background:${color};border:1px solid ${borde};border-radius:6px;padding:10px 14px;font-size:13px;line-height:1.5;margin-top:14px;color:${texto}`;

    let html = `<strong>${data.mensaje || 'Importación finalizada'}</strong>`;
    if (data.layout) html += `<br>Layout detectado: <strong>${data.layout}</strong>`;
    if (data.importados != null) html += `<br>Nuevos REQ: <strong>${data.importados}</strong>`;
    if (data.ocsCreadas) html += `<br>OC creadas: <strong>${data.ocsCreadas}</strong>`;
    const saltados = data.saltados
      ?? (data.errores || []).filter((e) =>
          String(e?.error || e || '').toLowerCase().includes('ya existe')).length;
    if (saltados) html += `<br>Ya existentes (omitidos): <strong>${saltados}</strong>`;
    if (data.duplicados?.length) {
      html += `<br>Duplicados en archivo (1 sola carga): <strong>${data.duplicados.length}</strong>`;
    }
    if (data.usuariosCreados?.length) {
      html += `<br>Usuarios nuevos (inactivos): <strong>${data.usuariosCreados.length}</strong>`;
    }
    if (data.sinCatalogo?.length) {
      html += `<br>Sin match de catálogo (nota en ítem): <strong>${data.sinCatalogo.length}</strong>`;
    }
    if (data.hojasSaltadas?.length) html += `<br>Hojas ignoradas: ${data.hojasSaltadas.join(', ')}`;
    if (data.errores?.length) {
      const muestra = data.errores.slice(0, 15).map((e) =>
        typeof e === 'string' ? e : `${e.consecutivo || ''} (fila ${e.filaExcel || '?'}): ${e.error || ''}`
      );
      html += `<br>Detalle omitidos/errores: <ul style="margin:4px 0 0 16px;padding:0">` +
              muestra.map((t) => `<li>${UI.esc ? UI.esc(t) : t}</li>`).join('') +
              (data.errores.length > 15 ? `<li>… y ${data.errores.length - 15} más</li>` : '') +
              `</ul>`;
    }
    resultado.innerHTML = html;

    if (data.importados > 0) {
      fileInput.value = '';
      document.getElementById('imp-preview').style.display = 'none';
      // Refrescar la lista
      if (typeof cargarRequerimientos === 'function') cargarRequerimientos(1);
    }
  } catch (err) {
    resultado.style.cssText = 'display:block;background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:10px 14px;font-size:13px;margin-top:14px;color:#991b1b';
    resultado.innerHTML     = `<strong>Error:</strong> ${err.message}`;
  } finally {
    btn.disabled    = false;
    btn.textContent = original;
  }
}
