// ── ÍTEMS LIBRES — flujo inline (sin modal separado) ─────────

let _unidadesMedidaReq = null;

/** Carga unidades estandarizadas y rellena el combo de ítem nuevo. */
async function cargarUnidadesMedidaReq(selected = '') {
  const sel = document.getElementById('libre-unidad');
  if (!sel || sel.tagName !== 'SELECT') return;

  if (!_unidadesMedidaReq) {
    try {
      _unidadesMedidaReq = await Api.get('/unidades-medida?soloActivas=true') || [];
    } catch {
      _unidadesMedidaReq = [];
    }
  }

  const val = selected || sel.value || '';
  const esc = (typeof UI !== 'undefined' && UI.esc)
    ? (s) => UI.esc(s)
    : (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  const opts = ['<option value="">— Unidad —</option>'];
  _unidadesMedidaReq.forEach((u) => {
    const cod = u.codigo || u.nombre || '';
    // Solo código en el combo (sin descripción)
    opts.push(`<option value="${esc(cod)}" title="${esc(u.nombre || cod)}">${esc(cod)}</option>`);
  });
  sel.innerHTML = opts.join('');

  if (val) {
    if (![...sel.options].some((o) => o.value === val)) {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = val;
      sel.appendChild(o);
    }
    sel.value = val;
  }
}

window.cargarUnidadesMedidaReq = cargarUnidadesMedidaReq;

function limpiarReferenciaLibreForm() {
  const linkInput = document.getElementById('libre-link');
  const fileInput = document.getElementById('libre-archivo');
  const radioLink = document.getElementById('libre-ref-link');
  if (linkInput) linkInput.value = '';
  if (fileInput) fileInput.value = '';
  if (radioLink) {
    radioLink.checked = true;
    toggleReferenciaLibre();
  }
  // Resetear tabs visuales
  const tabLink = document.getElementById('tab-ref-link');
  const tabArch = document.getElementById('tab-ref-archivo');
  if (tabLink)  tabLink.classList.add('active');
  if (tabArch)  tabArch.classList.remove('active');
}

window.toggleReferenciaLibre = function() {
  const esLink      = document.getElementById('libre-ref-link')?.checked;
  const linkWrap    = document.getElementById('libre-ref-link-wrap');
  const archivoWrap = document.getElementById('libre-ref-archivo-wrap');
  if (linkWrap)    linkWrap.style.display    = esLink ? 'block' : 'none';
  if (archivoWrap) archivoWrap.style.display = esLink ? 'none'  : 'block';
};

// ── Contadores ────────────────────────────────────────────────
function renderLibresResumen() {
  const n = (window.requerimientoItemsLibres || []).length;

  // Badge en el panel principal
  const countEl = document.getElementById('libres-count');
  if (countEl) {
    if (n > 0) {
      countEl.textContent = `${n} libre${n > 1 ? 's' : ''}`;
      countEl.style.cssText = 'display:inline-block; background:#fde68a; color:#92400e; font-size:10px; font-weight:700; padding:1px 7px; border-radius:999px;';
    } else {
      countEl.style.display = 'none';
    }
  }
}

// ── Lista unificada de ítems (catálogo + libres) ──────────────
// renderItemsSeleccionados vive en items-catalogo.js y llama a ambos arrays.
// Esta función es el punto de sincronización post-agregar libre.
function sincronizarListas() {
  renderLibresResumen();
  if (typeof renderItemsSeleccionados === 'function') renderItemsSeleccionados();
}

// ── Mostrar / ocultar el panel inline de ítem libre ───────────
window.mostrarLibreInline = function() {
  cargarUnidadesMedidaReq().catch(() => {});
  if (typeof window.seleccionarModoItems === 'function') {
    window.seleccionarModoItems('libre');
  } else {
    const panel = document.getElementById('libre-inline-section');
    if (panel) panel.style.display = 'block';
    setTimeout(() => document.getElementById('libre-descripcion')?.focus(), 80);
  }
};

function limpiarCamposFormLibre() {
  const descEl = document.getElementById('libre-descripcion');
  const cantEl = document.getElementById('libre-cantidad');
  const unidEl = document.getElementById('libre-unidad');
  const precioEl = document.getElementById('libre-precio');
  if (descEl) descEl.value = '';
  if (cantEl) cantEl.value = '1';
  if (precioEl) precioEl.value = '';
  if (unidEl) {
    unidEl.value = '';
    if (unidEl.tagName === 'SELECT') cargarUnidadesMedidaReq('').catch(() => {});
  }
  limpiarReferenciaLibreForm();
}

window.limpiarCamposFormLibre = limpiarCamposFormLibre;

function _limpiarFormLibreInline() {
  limpiarCamposFormLibre();
}

/**
 * Cierra el formulario de ítem nuevo (botón ×).
 * - Si ya hay ítems nuevos en la lista: solo oculta el form (no los borra).
 * - Si la lista está vacía: vuelve a modo catálogo sin preguntar.
 * silencioso = true → solo oculta DOM (resets internos).
 */
window.ocultarLibreInline = function(silencioso = false) {
  const panel = document.getElementById('libre-inline-section');
  const tieneLibres = (window.requerimientoItemsLibres || []).length > 0;

  if (silencioso) {
    if (panel) panel.style.display = 'none';
    _limpiarFormLibreInline();
    return;
  }

  // Ya hay ítems agregados: el × cierra el form, no los elimina
  if (tieneLibres) {
    if (panel) panel.style.display = 'none';
    _limpiarFormLibreInline();
    // Mantener modo "ítem nuevo" activo (lista sigue visible abajo)
    const btnLib = document.getElementById('mode-btn-libre');
    const btnCat = document.getElementById('mode-btn-catalogo');
    if (btnLib) {
      btnLib.classList.add('active-lib');
      btnLib.classList.remove('active-cat');
    }
    if (btnCat) {
      btnCat.classList.remove('active-cat');
      btnCat.classList.remove('active-lib');
    }
    const cb = document.getElementById('usar-items-nuevos');
    if (cb) cb.checked = true;
    return;
  }

  // Sin ítems nuevos: volver a catálogo sin confirmación
  if (typeof window.seleccionarModoItems === 'function') {
    window.seleccionarModoItems('catalogo', true);
  } else if (panel) {
    panel.style.display = 'none';
    _limpiarFormLibreInline();
  }
};

// ── Compatibilidad con el código JS existente ─────────────────
// toggleModoItemsNuevos — antes controlaba modos separados, ahora
// simplemente muestra/oculta el panel inline.
window.toggleModoItemsNuevos = function(checked) {
  if (checked) {
    // seleccionarModoItems ya valida mezcla y pide confirmación clara
    if (typeof window.seleccionarModoItems === 'function') {
      window.seleccionarModoItems('libre');
    } else {
      window.mostrarLibreInline();
    }
    // Si el usuario canceló el cambio de modo, desmarcar checkbox
    const tieneCatalogo = (window.requerimientoItemsSeleccionados || []).length > 0;
    const enLibre = document.getElementById('mode-btn-libre')?.classList.contains('active-lib');
    if (tieneCatalogo && !enLibre) {
      const cb = document.getElementById('usar-items-nuevos');
      if (cb) cb.checked = false;
    }
  } else {
    ocultarLibreInline();
    const cb = document.getElementById('usar-items-nuevos');
    if (cb) cb.checked = false;
  }
};

// abrirModalItemsLibres — redirige al panel inline
window.abrirModalItemsLibres = function() {
  window.mostrarLibreInline();
};

/**
 * Cierra / resetea el editor de ítems (tras guardar, cancelar o ×).
 * Siempre silencioso: NUNCA muestra confirm de “limpiar y cambiar a catálogo”.
 * Ese diálogo solo aplica al cambiar de modo a propósito (seleccionarModoItems).
 */
window.cerrarModalItemsLibres = function() {
  // Vaciar listas locales del modal (el REQ ya se guardó o se canceló)
  window.requerimientoItemsLibres = [];
  window.requerimientoItemsSeleccionados = [];
  if (typeof desbloquearFiltroProveedorCatalogo === 'function') {
    desbloquearFiltroProveedorCatalogo();
  }

  const panel = document.getElementById('libre-inline-section');
  if (panel) panel.style.display = 'none';
  if (typeof _limpiarFormLibreInline === 'function') _limpiarFormLibreInline();
  else {
    if (typeof limpiarCamposFormLibre === 'function') limpiarCamposFormLibre();
    else {
      const descEl = document.getElementById('libre-descripcion');
      const cantEl = document.getElementById('libre-cantidad');
      const unidEl = document.getElementById('libre-unidad');
      const precioEl = document.getElementById('libre-precio');
      if (descEl) descEl.value = '';
      if (cantEl) cantEl.value = '1';
      if (unidEl) unidEl.value = '';
      if (precioEl) precioEl.value = '';
      if (typeof limpiarReferenciaLibreForm === 'function') limpiarReferenciaLibreForm();
    }
  }

  const cb = document.getElementById('usar-items-nuevos');
  if (cb) cb.checked = false;

  const btnCat = document.getElementById('mode-btn-catalogo');
  const btnLib = document.getElementById('mode-btn-libre');
  const secCat = document.getElementById('seccion-items-catalogo');
  if (btnCat) { btnCat.classList.add('active-cat'); btnCat.classList.remove('active-lib'); }
  if (btnLib) { btnLib.classList.remove('active-lib'); btnLib.classList.remove('active-cat'); }
  if (secCat) secCat.style.display = 'block';

  const resCat = document.getElementById('resultados-catalogo');
  if (resCat) resCat.innerHTML = '';

  const modal = document.getElementById('modal-req-libres');
  if (modal) modal.style.display = 'none';

  if (typeof renderLibresResumen === 'function') renderLibresResumen();
  if (typeof renderItemsSeleccionados === 'function') renderItemsSeleccionados();
};

// deseleccionarYVolverACatalogo — vuelve a modo catálogo (con confirmación clara)
window.deseleccionarYVolverACatalogo = function() {
  if (typeof window.seleccionarModoItems === 'function') {
    window.seleccionarModoItems('catalogo');
  }
  const busq = document.getElementById('busqueda-catalogo');
  if (busq) setTimeout(() => busq.focus(), 100);
};

// ── Agregar ítem libre ────────────────────────────────────────
window.agregarItemLibre = async function() {
  const btn = document.getElementById('btn-agregar-item-libre');

  // Validación de mezcla (no se puede combinar catálogo + ítems nuevos)
  const tieneCatalogo = (window.requerimientoItemsSeleccionados || []).length > 0;
  if (tieneCatalogo) {
    const n = tieneCatalogo ? (window.requerimientoItemsSeleccionados || []).length : 0;
    const msg = n === 1
      ? 'Este requerimiento tiene 1 ítem del catálogo.\n\nNo se pueden mezclar con ítems nuevos.\n¿Eliminar el del catálogo y continuar?'
      : `Este requerimiento tiene ${n} ítems del catálogo.\n\nNo se pueden mezclar con ítems nuevos.\n¿Eliminarlos y continuar?`;
    if (!confirm(msg)) return;
    window.requerimientoItemsSeleccionados = [];
    if (typeof desbloquearFiltroProveedorCatalogo === 'function') desbloquearFiltroProveedorCatalogo();
    sincronizarListas();
    const cb = document.getElementById('usar-items-nuevos');
    if (cb) cb.checked = true;
  }

  const desc   = document.getElementById('libre-descripcion')?.value.trim();
  let cant     = parseFloat(document.getElementById('libre-cantidad')?.value) || 1;
  const unidad = (document.getElementById('libre-unidad')?.value || '').trim() || '';
  const precioRaw = document.getElementById('libre-precio')?.value;
  cant = Math.max(1, Math.round(cant));
  let precioSugerido = null;
  if (precioRaw !== '' && precioRaw != null) {
    const n = parseFloat(precioRaw);
    if (!Number.isFinite(n) || n < 0) {
      Toast.error('El precio sugerido debe ser un número mayor o igual a 0');
      document.getElementById('libre-precio')?.focus();
      return;
    }
    precioSugerido = Math.round(n * 100) / 100;
  }

  if (!desc || desc.length < 3) {
    Toast.error('La descripción debe tener al menos 3 caracteres');
    document.getElementById('libre-descripcion')?.focus();
    return;
  }
  // Unidad opcional pero, si se captura, viene del catálogo estandarizado (combo)

  const maxItems = window.MAX_ITEMS_POR_REQ || 15;
  const nLibres = (window.requerimientoItemsLibres || []).length;
  if (nLibres >= maxItems) {
    Toast.error(`Máximo ${maxItems} ítems por requerimiento. Crea otro REQ para agregar más.`);
    return;
  }

  const item = { descripcion: desc, cantidad: cant, unidad, notas: '', precio_sugerido: precioSugerido };
  const esArchivo = document.getElementById('libre-ref-archivo')?.checked;
  const link      = document.getElementById('libre-link')?.value.trim() || '';
  const archivo   = document.getElementById('libre-archivo')?.files?.[0] || null;

  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Agregando…'; }

    if (esArchivo && archivo) {
      const subido = await Api.uploadForm('/requerimientos/referencia-item', { archivo });
      item.referencia_tipo   = 'archivo';
      item.referencia_url    = subido.referencia_url;
      item.referencia_nombre = subido.referencia_nombre;
    } else if (!esArchivo && link) {
      if (!/^https?:\/\//i.test(link)) {
        Toast.error('El enlace debe comenzar con http:// o https://');
        return;
      }
      item.referencia_tipo = 'link';
      item.referencia_url  = link;
      item.referencia_nombre = null;
    }

    if (!window.requerimientoItemsLibres) window.requerimientoItemsLibres = [];
    window.requerimientoItemsLibres.push(item);

    const cb = document.getElementById('usar-items-nuevos');
    if (cb) cb.checked = true;

    // Asegurar modo libre activo (sin confirmaciones ni limpiar la lista)
    const btnLib = document.getElementById('mode-btn-libre');
    const btnCat = document.getElementById('mode-btn-catalogo');
    const secCat = document.getElementById('seccion-items-catalogo');
    const secLib = document.getElementById('libre-inline-section');
    if (btnLib) { btnLib.classList.add('active-lib'); btnLib.classList.remove('active-cat'); }
    if (btnCat) { btnCat.classList.remove('active-cat'); btnCat.classList.remove('active-lib'); }
    if (secCat) secCat.style.display = 'none';
    if (secLib) secLib.style.display = 'block';

    sincronizarListas();

    // Limpiar el form para el siguiente ítem (la lista de seleccionados se mantiene)
    _limpiarFormLibreInline();
    document.getElementById('libre-descripcion')?.focus();
    Toast.success('Ítem nuevo agregado a la lista');

  } catch (err) {
    Toast.error(err.mensaje || 'Error al agregar el ítem');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '+ Agregar ítem'; }
  }
};

// ── Eliminar ítem libre desde la lista unificada ──────────────
window.eliminarItemLibreInline = function(index) {
  if (window.requerimientoItemsLibres) {
    window.requerimientoItemsLibres.splice(index, 1);
    sincronizarListas();
    // Si ya no hay libres, volver a modo catálogo
    if (window.requerimientoItemsLibres.length === 0) {
      // Sin confirm: el array ya está vacío, no hay nada que limpiar
      ocultarLibreInline(true); // silencioso: solo oculta
      if (typeof window.seleccionarModoItems === 'function') {
        window.seleccionarModoItems('catalogo', true);
      }
    }
  }
};

// Alias para compat con código que llama eliminarItemLibre(index)
window.eliminarItemLibre = window.eliminarItemLibreInline;

// ── Funciones heredadas — ya no se usan pero evitan errores ───
function renderItemsLibresModal() { sincronizarListas(); }
window.mostrarFormItemLibre  = window.mostrarLibreInline;
window.ocultarFormItemLibre  = window.ocultarLibreInline;
