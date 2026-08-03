// ── EDITOR DE REQUERIMIENTO (crear / editar) ──────────────────

const REQ_DRAFT_KEY = 'oc_req_draft';

const ReqDraft = {
  save() {
    const itemsCatalogo = typeof CarritoReq !== 'undefined' && CarritoReq.count()
      ? CarritoReq.getItems()
      : (window.requerimientoItemsSeleccionados || []);

    const data = {
      titulo: document.getElementById('req-titulo')?.value || '',
      tipo: document.getElementById('req-tipo')?.value || '',
      area: document.getElementById('req-area')?.value || '',
      departamento: document.getElementById('req-departamento')?.value || '',
      notas: document.getElementById('req-notas')?.value || '',
      items_catalogo: itemsCatalogo.map((i) => ({ ...i })),
      items_libres: (window.requerimientoItemsLibres || []).map((i) => ({ ...i })),
      modo_items: document.getElementById('usar-items-nuevos')?.checked ? 'libres' : 'catalogo',
    };
    sessionStorage.setItem(REQ_DRAFT_KEY, JSON.stringify(data));
  },

  load() {
    try {
      const raw = sessionStorage.getItem(REQ_DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  clear() {
    sessionStorage.removeItem(REQ_DRAFT_KEY);
  },

  restoreToForm() {
    const draft = this.load();
    if (!draft) return false;

    const titulo = document.getElementById('req-titulo');
    const tipo = document.getElementById('req-tipo');
    const area = document.getElementById('req-area');
    const depto = document.getElementById('req-departamento');
    const notas = document.getElementById('req-notas');

    if (titulo && draft.titulo) titulo.value = draft.titulo;
    if (tipo && draft.tipo) tipo.value = draft.tipo;
    if (area && draft.area) {
      area.value = draft.area;
      if (typeof filtrarDeptosPorArea === 'function') filtrarDeptosPorArea(draft.area);
    }
    if (depto && draft.departamento) depto.value = draft.departamento;
    if (notas && draft.notas) notas.value = draft.notas;

    if (draft.modo_items === 'libres' && draft.items_libres?.length) {
      window.requerimientoItemsLibres = draft.items_libres.map((i) => ({ ...i }));
      const checkbox = document.getElementById('usar-items-nuevos');
      if (checkbox) checkbox.checked = true;
      if (typeof window.seleccionarModoItems === 'function') window.seleccionarModoItems('libre', true);
      if (typeof renderLibresResumen === 'function') renderLibresResumen();
    } else if (draft.modo_items === 'catalogo' && typeof window.seleccionarModoItems === 'function') {
      window.seleccionarModoItems('catalogo', true);
    }

    return true;
  },

  syncCarritoDesdeModal() {
    const sel = window.requerimientoItemsSeleccionados || [];
    if (typeof CarritoReq === 'undefined' || !sel.length) return;
    CarritoReq.reemplazar(sel);
  },
};

window.ReqDraft = ReqDraft;

window.irAlCatalogoDesdeReq = function() {
  if (typeof ReqDraft !== 'undefined') {
    ReqDraft.syncCarritoDesdeModal();
    ReqDraft.save();
  }
  window.location.href = 'catalogo.html';
};

function puedeGestionarCotizaciones() {
  return Auth.puedeHacer(['compras', 'admin']);
}

async function abrirEditorRequerimiento(req = null, opts = {}) {
  const restaurarBorrador = opts.restaurarBorrador === true;
  const tituloEl   = document.querySelector('#modal-req .modal-title');
  const btnGuardar = document.getElementById('btn-guardar-req');
  const form       = document.getElementById('form-req');

  // Cargar áreas dinámicas si no están en caché
  if (typeof cargarAreasEnForm === 'function') {
    await cargarAreasEnForm();
  }
  // Unidades estandarizadas para ítems nuevos (combo)
  if (typeof window.cargarUnidadesMedidaReq === 'function') {
    await window.cargarUnidadesMedidaReq().catch(() => {});
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

    const itemsEdit = (req.items || []).map(i => ({
      catalogo_id:     i.catalogo_id,
      codigo:          i.codigo,
      descripcion:     i.descripcion,
      costo_referencia: i.costo_referencia != null ? parseFloat(i.costo_referencia) : null,
      moneda:          i.moneda || 'MXN',
      proveedor_id:    i.proveedor_id != null ? parseInt(i.proveedor_id, 10) : null,
      proveedor_nombre: i.proveedor_nombre || '',
      proveedor_num:   i.proveedor_num || '',
      tipo:            req.tipo || '',
      cantidad:        Math.round(i.cantidad) || 1
    }));
    CarritoReq.reemplazar(itemsEdit);
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

    if (!restaurarBorrador) ReqDraft.clear();

    CarritoReq.load();
    const itemsCarritoInicial = CarritoReq.getItems().map((i) => ({ ...i }));
    const draft = restaurarBorrador ? ReqDraft.load() : null;

    window.requerimientoItemsLibres = [];
    window.requerimientoItemsSeleccionados = [];

    let borradorRestaurado = false;
    window._reqRestaurandoBorrador = true;
    try {
      if (restaurarBorrador) {
        borradorRestaurado = ReqDraft.restoreToForm();
      }
    } finally {
      window._reqRestaurandoBorrador = false;
    }

    let itemsFinales = itemsCarritoInicial;
    if (itemsCarritoInicial.length === 0 && draft?.items_catalogo?.length) {
      CarritoReq.reemplazar(draft.items_catalogo);
      itemsFinales = CarritoReq.getItems();
    } else if (itemsCarritoInicial.length > 0) {
      CarritoReq.reemplazar(itemsCarritoInicial);
      itemsFinales = CarritoReq.getItems();
    }

    window.requerimientoItemsSeleccionados = itemsFinales;

    const tipoEl = document.getElementById('req-tipo');
    if (itemsFinales.length > 0 && itemsFinales[0].tipo) {
      window._reqRestaurandoBorrador = true;
      try {
        if (tipoEl) tipoEl.value = itemsFinales[0].tipo;
      } finally {
        window._reqRestaurandoBorrador = false;
      }
    } else if (borradorRestaurado && draft?.tipo && tipoEl && !tipoEl.value) {
      window._reqRestaurandoBorrador = true;
      try {
        tipoEl.value = draft.tipo;
      } finally {
        window._reqRestaurandoBorrador = false;
      }
    }

    if (borradorRestaurado && draft?.modo_items === 'libres' && draft.items_libres?.length) {
      window.requerimientoItemsLibres = draft.items_libres.map((i) => ({ ...i }));
    } else if (!borradorRestaurado || draft?.modo_items !== 'libres') {
      window.requerimientoItemsLibres = [];
    }

    renderItemsSeleccionados();
    renderLibresResumen();

    const seccion = document.getElementById('seccion-items-catalogo');
    if (seccion) seccion.style.opacity = '1';

    const enModoLibres = draft?.modo_items === 'libres' && draft?.items_libres?.length;
    if (enModoLibres) {
      if (typeof window.seleccionarModoItems === 'function') window.seleccionarModoItems('libre', true);
    } else if (itemsFinales.length > 0) {
      if (typeof window.seleccionarModoItems === 'function') window.seleccionarModoItems('catalogo', true);
      const provId = itemsFinales[0].proveedor_id;
      if (provId != null && typeof bloquearFiltroProveedorCatalogo === 'function') {
        bloquearFiltroProveedorCatalogo(provId);
      }
    } else if (borradorRestaurado && draft?.modo_items === 'catalogo') {
      if (typeof window.seleccionarModoItems === 'function') window.seleccionarModoItems('catalogo', true);
    }

    if (restaurarBorrador && (borradorRestaurado || itemsFinales.length > 0)) {
      window._reqBorradorRecienRestaurado = true;
    }
  }

  const seccion   = document.getElementById('seccion-items-catalogo');
  const selector  = document.getElementById('selector-items-nuevos');
  const tipoVal   = document.getElementById('req-tipo').value;

  if (seccion)  seccion.style.display  = tipoVal ? 'block' : 'none';
  if (selector) selector.style.display = tipoVal ? 'block' : 'none';

  // El panel inline de libres lo controla mostrarLibreInline() — no se toca aquí.

  const provWrapper2 = document.getElementById('filtro-proveedor-wrapper');
  if (provWrapper2) provWrapper2.style.display = tipoVal ? '' : 'none';
  if (tipoVal && typeof initFiltroProveedorReq === 'function') initFiltroProveedorReq();

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

  if (!tieneCatalogo && !tieneLibres) {
    Toast.error('Agrega al menos un ítem del catálogo o un ítem nuevo antes de guardar.');
    btn.disabled = false;
    return;
  }

  const maxItems = window.MAX_ITEMS_POR_REQ || 15;
  const totalLineas = (window.requerimientoItemsSeleccionados || []).length
    + (window.requerimientoItemsLibres || []).length;
  if (totalLineas > maxItems) {
    Toast.error(`Máximo ${maxItems} ítems por requerimiento. Tienes ${totalLineas}. Crea otro REQ para el resto.`);
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
    // SERVICIOS siempre; PARTES sin precio ref.; ítems libres — el backend lo recalcula
    requiere_cotizacion: (function () {
      if (tieneLibres) return true;
      const tipo = (document.getElementById('req-tipo')?.value || '').toUpperCase();
      if (tipo === 'SERVICIOS') return true;
      const cat = window.requerimientoItemsSeleccionados || [];
      return cat.some((i) => {
        if (i.costo_referencia == null || i.costo_referencia === '') return true;
        const n = parseFloat(i.costo_referencia);
        return Number.isNaN(n);
      });
    })(),
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
      CarritoReq.vaciar();
      ReqDraft.clear();
      UI.cerrarModal('modal-req');
      if (typeof cerrarModalItemsLibres === 'function') cerrarModalItemsLibres();
      Toast.success('Requerimiento actualizado');
      if (requerimientoActual && requerimientoActual.id === idAEditar) {
        abrirDetalle(idAEditar);
      }
    } else {
      resultado = await Api.post('/requerimientos', payload);
      editandoId = null;
      CarritoReq.vaciar();
      ReqDraft.clear();
      UI.cerrarModal('modal-req');
      if (typeof cerrarModalItemsLibres === 'function') cerrarModalItemsLibres();
      const label = resultado.consecutivo
        ? `Requerimiento ${resultado.consecutivo} creado (borrador)`
        : 'Borrador creado (el consecutivo se asigna al enviar a revisión)';
      Toast.success(label);
      abrirDetalle(resultado.id);
    }
  } catch (err) {
    Toast.error(err.mensaje || (editandoId ? 'Error al actualizar' : 'Error al crear requerimiento'));
  } finally {
    btn.disabled = false;
  }
});
