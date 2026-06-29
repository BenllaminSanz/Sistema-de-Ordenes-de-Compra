// ── EXPORT / IMPORT EXCEL ────────────────────────────────────────────────────

async function exportarRequerimientos(btn) {
  const original = btn.textContent;
  btn.disabled   = true;
  btn.textContent = 'Generando…';
  try {
    const response = await fetch('/api/requerimientos/exportar', {
      headers: { Authorization: `Bearer ${Auth.getToken()}` },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.mensaje || 'Error al exportar');
    }
    const blob     = await response.blob();
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    const fecha    = new Date().toISOString().slice(0, 10);
    a.href         = url;
    a.download     = `Requerimientos-${fecha}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Error al exportar: ' + err.message);
  } finally {
    btn.disabled   = false;
    btn.textContent = original;
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

    let html = `<strong>${data.mensaje}</strong>`;
    if (data.saltados) html += `<br>Registros ya existentes (omitidos): <strong>${data.saltados}</strong>`;
    if (data.hojasSaltadas?.length) html += `<br>Hojas ignoradas: ${data.hojasSaltadas.join(', ')}`;
    if (data.errores?.length) {
      html += `<br>Errores: <ul style="margin:4px 0 0 16px;padding:0">` +
              data.errores.map(e => `<li>${e}</li>`).join('') + `</ul>`;
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
