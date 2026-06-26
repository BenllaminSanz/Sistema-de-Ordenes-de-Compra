// ── EDITOR DE REQUERIMIENTO (crear / editar) ──────────────────

function puedeGestionarCotizaciones() {
  return Auth.puedeHacer(['contabilidad', 'admin']);
}

async function abrirEditorRequerimiento(req = null) {
  const tituloEl   = document.querySelector('#modal-req .modal-title');
  const btnGuardar = document.getElementById('btn-guardar-req');
  const form       = document.getElementById('form-req');

  // Cargar áreas dinámicas si no están en caché
  if (typeof cargarAreasEnForm === 'function') {
    await cargarAreasEnForm();
  }

  if (req && req.id) {
    editandoId = req.id;
    tituloEl.textContent = 'Editar requerimiento';
    btnGuardar.textContent = 'Guardar cambios';

    document.getElementById('req-titulo').value = req.titulo_solicitud || '';
    document.getElementById('req-tipo').value   = req.tipo || '';
    // Seleccionar área y luego disparar filtrado para poblar deptos antes de fijar departamento
    const areaEl = document.getElementById('req-area');
    if (areaEl) {
      areaEl.value = req.area || '';
      if (typeof filtrarDeptosPorArea === 'function') filtrarDeptosPorArea(areaEl.value);
    }
    document.getElementById('req-departamento').value = req.departamento || '';
    document.getElementById('req-notas').value        = req.notas || req.descripcion || '';

    window.requerimientoItemsSeleccionados = (req.items || []).map(i => ({
      catalogo_id:     i.catalogo_id,
      codigo:          i.codigo,
      descripcion:     i.descripcion,
      costo_referencia: i.costo_referencia != null ? parseFloat(i.costo_referencia) : null,
      moneda:          i.moneda || 'MXN',
      cantidad:        Math.round(i.cantidad) || 1
    }));
    renderItemsSeleccionados();

    window.requerimientoItemsLibres = (req.items_libres || []).map(i => ({
      descripcion: i.descripcion,
      cantidad:    Math.max(1, Math.round(parseFloat(i.cantidad) || 1)),
      unidad:      i.unidad || '',
      notas:       i.notas || '',
      referencia_tipo: i.referencia_tipo || null,
      referencia_url: i.referencia_url || null,
      referencia_nombre: i.referencia_nombre || null,
    }));
    renderLibresResumen();

    // Si tiene ítems libres, mostrar el panel inline después de abrir el modal
    const tieneLibresEdit = (req.items_libres && req.items_libres.length > 0) &&
                            (!req.items || req.items.length === 0);
    if (tieneLibresEdit) {
      const checkbox = document.getElementById('usar-items-nuevos');
      if (checkbox) checkbox.checked = true;
      setTimeout(() => {
        if (typeof mostrarLibreInline === 'function') mostrarLibreInline();
      }, 100);
    }

    const tieneAmbos = (req.items && req.items.length > 0) &&
                       (req.items_libres && req.items_libres.length > 0);
    if (tieneAmbos) {
      Toast.warning('Este requerimiento tiene tanto ítems del catálogo como libres. Elige un solo tipo.');
    }
  } else {
    editandoId = null;
    tituloEl.textContent = 'Nuevo requerimiento';
    btnGuardar.textContent = 'Guardar';
    form.reset();
    window.requerimientoItemsSeleccionados = [];
    window.requerimientoItemsLibres = [];
    renderItemsSeleccionados();
    renderLibresResumen();

    const checkbox = document.getElementById('usar-items-nuevos');
    if (checkbox) checkbox.checked = false;

    const seccion = document.getElementById('seccion-items-catalogo');
    if (seccion) seccion.style.opacity = '1';
  }

  const seccion   = document.getElementById('seccion-items-catalogo');
  const selector  = document.getElementById('selector-items-nuevos');
  const tipoVal   = document.getElementById('req-tipo').value;

  if (seccion)  seccion.style.display  = tipoVal ? 'block' : 'none';
  if (selector) selector.style.display = tipoVal ? 'block' : 'none';

  // El panel inline de libres lo controla mostrarLibreInline() — no se toca aquí.

  const provWrapper2 = document.getElementById('filtro-proveedor-wrapper');
  const provSel2     = document.getElementById('filtro-proveedor-catalogo');
  if (provWrapper2) provWrapper2.style.display = tipoVal ? '' : 'none';
  if (provSel2 && !tipoVal) provSel2.value = '';
  if (tipoVal) cargarFiltroProveedoresParaCatalogo();

  UI.abrirModal('modal-req');
}

// Limpiar editandoId al cerrar el modal
const modalReq = document.getElementById('modal-req');
if (modalReq) {
  modalReq.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-close') ||
        (e.target.tagName === 'BUTTON' && e.target.textContent.includes('Cancelar'))) {
      setTimeout(() => { editandoId = null; }, 150);
    }
  });
}

// ── Submit del formulario ─────────────────────────────────────
document.getElementById('form-req').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btn-guardar-req');
  btn.disabled = true;

  const tieneCatalogo = (window.requerimientoItemsSeleccionados || []).length > 0;
  const tieneLibres   = (window.requerimientoItemsLibres || []).length > 0;

  if (tieneCatalogo && tieneLibres) {
    Toast.error('No se puede guardar un requerimiento con ítems del catálogo y ítems libres al mismo tiempo. Elige uno de los dos tipos.');
    btn.disabled = false;
    return;
  }

  const area = document.getElementById('req-area').value;
  const departamento = document.getElementById('req-departamento').value;

  if (typeof validarComboAreaDepto === 'function') {
    const v = validarComboAreaDepto(area, departamento);
    if (!v.ok) {
      Toast.error(v.mensaje);
      btn.disabled = false;
      return;
    }
  }

  const payload = {
    titulo_solicitud:    document.getElementById('req-titulo').value,
    tipo:                document.getElementById('req-tipo').value,
    area,
    departamento,
    notas:               document.getElementById('req-notas')?.value || '',
    requiere_cotizacion: tieneLibres,
    items: (window.requerimientoItemsSeleccionados || []).map(i => ({
      catalogo_id: i.catalogo_id,
      cantidad:    i.cantidad
    })),
    items_libres: (window.requerimientoItemsLibres || []).map(i => ({
      descripcion: i.descripcion,
      cantidad:    i.cantidad,
      unidad:      i.unidad || null,
      notas:       i.notas  || null,
      referencia_tipo: i.referencia_tipo || null,
      referencia_url: i.referencia_url || null,
      referencia_nombre: i.referencia_nombre || null,
    })),
  };

  try {
    let resultado;
    if (editandoId) {
      const idAEditar = editandoId;
      resultado = await Api.put(`/requerimientos/${idAEditar}`, payload);
      editandoId = null;
      UI.cerrarModal('modal-req');
      if (typeof cerrarModalItemsLibres === 'function') cerrarModalItemsLibres();
      Toast.success('Requerimiento actualizado');
      if (requerimientoActual && requerimientoActual.id === idAEditar) {
        abrirDetalle(idAEditar);
      }
    } else {
      resultado = await Api.post('/requerimientos', payload);
      editandoId = null;
      UI.cerrarModal('modal-req');
      if (typeof cerrarModalItemsLibres === 'function') cerrarModalItemsLibres();
      Toast.success(`Requerimiento ${resultado.consecutivo} creado (borrador)`);
      abrirDetalle(resultado.id);
    }
  } catch (err) {
    Toast.error(err.mensaje || (editandoId ? 'Error al actualizar' : 'Error al crear requerimiento'));
  } finally {
    btn.disabled = false;
  }
});
