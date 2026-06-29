/**
 * ordenes.js
 * Lógica de la página de Órdenes de Compra
 */

Auth.requiereAuth();
renderSidebar();
renderTopbar('Órdenes de Compra');

let ocActual = null;
let recepcionesActuales = [];
let resumenItemsOc = [];
let recepcionEditandoId = null;

const ESTADOS_RECEPCION_LISTOS_CIERRE = ['entregado_solicitante', 'recibido_completo'];

function resolverPoOrden(oc, recepciones, poNuevo) {
  if (poNuevo != null && String(poNuevo).trim()) return String(poNuevo).trim();
  if (oc?.datatextnow_id && String(oc.datatextnow_id).trim()) return String(oc.datatextnow_id).trim();
  const rec = (recepciones || []).find(r => r.datatextnow_id && String(r.datatextnow_id).trim());
  return rec ? String(rec.datatextnow_id).trim() : null;
}

function evaluarCierreOc(oc, recepciones, { poNuevo } = {}) {
  if (!oc || oc.estado === 'cerrada') {
    return { ok: false, motivo: 'ya_cerrada' };
  }

  const recs = recepciones || [];
  if (!recs.length) {
    return { ok: false, motivo: 'sin_recepciones' };
  }

  const pendientes = recs.filter(r => !ESTADOS_RECEPCION_LISTOS_CIERRE.includes(r.estado));
  if (pendientes.length) {
    return { ok: false, motivo: 'recepciones_pendientes' };
  }

  const po = resolverPoOrden(oc, recs, poNuevo);
  if (!po) {
    return { ok: false, motivo: 'sin_po' };
  }

  return { ok: true, po };
}

function mensajeConfirmacionCierreRecepcion(evaluacion) {
  if (evaluacion.ok) {
    return 'Se cumplen los requisitos para cerrar la Orden de Compra.\n\n'
      + 'Al confirmar esta recepción completa, la OC se cerrará automáticamente.\n\n'
      + '¿Deseas continuar?';
  }
  if (evaluacion.motivo === 'sin_po') {
    return 'La recepción se registrará, pero la OC no se cerrará hasta que exista '
      + 'el PO de DataTextNow.\n\n¿Deseas continuar?';
  }
  return null;
}

function actualizarAvisoCierreRecepcion() {
  const aviso = document.getElementById('rec-aviso-cierre');
  if (!aviso || !ocActual) return;

  const estado = document.getElementById('rec-estado')?.value;
  const poNuevo = document.getElementById('rec-datatextnow')?.value || null;

  if (estado === 'recibido_parcial' || ocActual.estado === 'cerrada') {
    aviso.style.display = 'none';
    return;
  }

  const recsProyectadas = [
    ...(recepcionesActuales || []),
    { estado: 'recibido_completo', datatextnow_id: poNuevo },
  ];
  const evaluacion = evaluarCierreOc(ocActual, recsProyectadas, { poNuevo });

  if (evaluacion.ok) {
    aviso.style.display = 'block';
    aviso.innerHTML = '<strong>Atención:</strong> Al confirmar esta recepción completa, '
      + 'la Orden de Compra <strong>se cerrará automáticamente</strong>.';
    return;
  }

  if (evaluacion.motivo === 'sin_po') {
    aviso.style.display = 'block';
    aviso.innerHTML = 'La recepción se registrará, pero la OC <strong>no se cerrará</strong> '
      + 'hasta registrar el PO de DataTextNow (en este formulario o en la OC).';
    return;
  }

  if (evaluacion.motivo === 'recepciones_pendientes') {
    aviso.style.display = 'block';
    aviso.innerHTML = 'Hay recepciones parciales pendientes. La OC <strong>no se cerrará</strong> '
      + 'hasta completar todas las recepciones y contar con el PO de DataTextNow.';
    return;
  }

  aviso.style.display = 'none';
}

const params = new URLSearchParams(window.location.search);
if (params.get('id')) {
  abrirDetalle(params.get('id'));
} else {
  aplicarFiltrosDesdeUrl();
  cargarOrdenes(1);
}

function aplicarFiltrosDesdeUrl() {
  const estado = params.get('estado');
  const tipo = params.get('tipo');
  const sinPo = params.get('sin_po');
  const busqueda = params.get('busqueda');

  if (estado) {
    const sel = document.getElementById('fil-estado');
    if (sel) sel.value = estado;
  }
  if (tipo) {
    const sel = document.getElementById('fil-tipo');
    if (sel) sel.value = tipo;
  }
  if (sinPo === '1' || sinPo === 'true') {
    const chk = document.getElementById('fil-sin-po');
    if (chk) chk.checked = true;
  }
  if (busqueda) {
    const inp = document.getElementById('fil-busqueda-oc');
    if (inp) inp.value = busqueda;
  }
}

// Delegación para la tabla de órdenes
const tablaOC = document.getElementById('tabla-oc');
if (tablaOC) {
  window.delegate(tablaOC, 'button[data-action="ver-oc"]', 'click', (e, btn) => {
    const id = btn.dataset.id;
    if (id) abrirDetalle(id);
  });
}

// ── LISTA ─────────────────────────────────────────────────────
async function cargarOrdenes(pagina) {
  const contenedor = document.getElementById('tabla-oc');
  UI.spinner(contenedor);

  const usuario = Auth.getUsuario();
  const esSolicitante = usuario?.rol === 'solicitante';
  const esAdminOContab = !esSolicitante;

  // Subtítulo contextual para solicitantes
  const subtitle = document.getElementById('oc-subtitle');
  if (subtitle) {
    if (esSolicitante) {
      subtitle.innerHTML = 'Solo se muestran las OC que nacen de <strong>tus requerimientos aprobados</strong>.';
      subtitle.style.display = '';
    } else {
      subtitle.textContent = '';
      subtitle.style.display = 'none';
    }
  }

  const estado    = document.getElementById('fil-estado')?.value || '';
  const tipo      = document.getElementById('fil-tipo')?.value || '';
  const sinPo     = document.getElementById('fil-sin-po')?.checked;
  const busqueda  = document.getElementById('fil-busqueda-oc')?.value.trim() || '';
  let qs = `?pagina=${pagina}&limite=15`;
  if (estado)   qs += `&estado=${encodeURIComponent(estado)}`;
  if (tipo)     qs += `&tipo=${encodeURIComponent(tipo)}`;
  if (sinPo)    qs += '&sin_po=true';
  if (busqueda) qs += `&busqueda=${encodeURIComponent(busqueda)}`;

  try {
    const { datos, total, limite } = await Api.get('/ordenes-compra' + qs);

    if (!datos.length) {
      const hayFiltros = estado || tipo || sinPo || busqueda;
      let msg = esSolicitante
        ? 'No tienes órdenes de compra que coincidan con el filtro.'
        : 'No hay órdenes de compra que coincidan con el filtro.';
      if (!hayFiltros) {
        msg = esSolicitante
          ? 'No tienes órdenes de compra generadas a partir de tus requerimientos.'
          : 'No hay órdenes de compra';
      } else if (estado === 'activas') {
        msg = 'No hay órdenes de compra activas o pendientes de cerrar.';
      } else if (sinPo) {
        msg = 'No hay órdenes sin PO DataTextNow con los filtros seleccionados.';
      }
      UI.empty(contenedor, msg);
      document.getElementById('paginacion-oc').innerHTML = '';
      return;
    }

    // Columna dinámica según rol:
    // - Admin/Contabilidad: mostrar "Solicitante" (quien lo pidió)
    // - Solicitante: mostrar "Autorizado por" (quien autorizó la OC)
    const columnaHeader = esAdminOContab ? 'Solicitante' : 'Autorizado por';
    const getColumnaValor = (o) => esAdminOContab 
      ? (o.solicitante_nombre || '—') 
      : (o.autorizado_por_nombre || '—');

    contenedor.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Número OC</th><th>PO DTN</th><th>Requerimiento</th><th>Tipo</th>
            <th>Proveedor</th><th>Monto</th><th>${columnaHeader}</th>
            <th>Estado</th><th>Fecha</th><th></th>
          </tr></thead>
          <tbody>${datos.map(o => `
            <tr>
              <td class="fw-600">${o.numero_oc}</td>
              <td class="text-muted small">${o.datatextnow_id || '—'}</td>
              <td>${o.consecutivo}</td>
              <td>${o.tipo}</td>
              <td>${UI.labelProveedor(o)}</td>
              <td>${o.monto_total
                    ? '$' + Number(o.monto_total).toLocaleString('es-MX') + ' ' + o.moneda
                    : '—'}</td>
              <td>${getColumnaValor(o)}</td>
              <td>${UI.badge(o.estado)}</td>
              <td class="text-muted text-sm">${UI.fecha(o.created_at)}</td>
              <td>
                <button class="btn btn-sm btn-outline" data-action="ver-oc" data-id="${o.id}" title="Ver detalle" style="padding:2px 6px;">
                  <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.25" viewBox="0 0 24 24" style="vertical-align:-1px;">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    UI.paginacion(
      document.getElementById('paginacion-oc'),
      total, pagina, limite,
      (p) => cargarOrdenes(p)
    );
  } catch (err) {
    UI.empty(contenedor, 'Error al cargar');
    Toast.error(err.mensaje || 'Error al cargar OC');
  }
}

// ── DETALLE ───────────────────────────────────────────────────
async function abrirDetalle(id) {
  document.getElementById('vista-lista').style.display   = 'none';
  document.getElementById('vista-detalle').style.display = 'block';
  document.getElementById('detalle-info').innerHTML = '<div class="spinner"></div>';

  try {
    const oc = await Api.get(`/ordenes-compra/${id}`);
    ocActual  = oc;
    renderDetalle(oc);
    cargarRecepciones(oc.id);
  } catch { Toast.error('No se pudo cargar la OC'); }
}

function volverLista() {
  document.getElementById('vista-lista').style.display   = 'block';
  document.getElementById('vista-detalle').style.display = 'none';
  ocActual = null;
  recepcionesActuales = [];
  resumenItemsOc = [];
  recepcionEditandoId = null;
  cargarOrdenes(1);
  history.replaceState(null, '', window.location.pathname);
}

// Editar DataTextNow de la OC principal (PO Number de los reportes Excel de DataTextNow)
async function editarDataTextNowOC(ocId, valorActual) {
  const nuevo = prompt('Ingresa el Número de PO de DataTextNow (ej. 0310005905):', valorActual || '');
  if (nuevo === null) return;

  try {
    const updated = await Api.patch(`/ordenes-compra/${ocId}/datatextnow`, {
      datatextnow_id: nuevo.trim() || null
    });
    Toast.success('PO de DataTextNow actualizado');
    ocActual = updated;
    renderDetalle(updated);
  } catch (err) {
    Toast.error(err.mensaje || 'Error al actualizar el PO de DataTextNow');
  }
}

function renderDetalle(oc) {
  document.getElementById('detalle-titulo').textContent = oc.numero_oc;

  // En el detalle de OC (según rol):
  // - Admin/Contabilidad: mostrar "Solicitante" (quién lo solicitó)  [en vez de Autorizado por]
  // - Solicitante: mostrar "Autorizado por" (quién autorizó)
  const u = Auth.getUsuario();
  const esSol = u?.rol === 'solicitante';
  const mostrarSolicitanteRow = !esSol;
  const mostrarAutorizadoRow = esSol;   // solo para solicitantes (admins ven al solicitante en su lugar)

  document.getElementById('detalle-info').innerHTML = `
    <div class="card-title">Información de la OC</div>
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:6px 0;color:#6b7280;width:150px">Número OC</td>
          <td class="fw-600">${oc.numero_oc}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Estado</td>
          <td>${UI.badge(oc.estado)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Requerimiento</td>
          <td>
            <a href="requerimientos.html?id=${oc.requerimiento_id}"
               style="color:var(--primary)">${oc.consecutivo}</a>
          </td></tr>
      ${mostrarSolicitanteRow ? `
      <tr><td style="padding:6px 0;color:#6b7280">Solicitante</td>
          <td><strong>${oc.solicitante_nombre || '—'}</strong></td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#6b7280">Tipo</td>
          <td>${oc.tipo}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Proveedor</td>
          <td>${UI.labelProveedor(oc)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Monto</td>
          <td>${oc.monto_total
                ? '$' + Number(oc.monto_total).toLocaleString('es-MX') + ' ' + oc.moneda
                : '—'}</td></tr>
      ${mostrarAutorizadoRow ? `
      <tr><td style="padding:6px 0;color:#6b7280">Autorizado por</td>
          <td>${oc.autorizado_por_nombre}</td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#6b7280">Fecha autorización</td>
          <td>${UI.fecha(oc.fecha_autorizacion)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">PO en DataTextNow</td>
          <td>
            ${oc.datatextnow_id || '—'}
            ${Auth.puedeHacer(['contabilidad','admin']) 
              ? (() => {
                  const safe = String(oc.datatextnow_id || '').replace(/'/g, "\\'");
                  return `<button onclick="editarDataTextNowOC(${oc.id}, '${safe}')" 
                             class="btn btn-sm btn-outline" title="Editar PO" style="margin-left:8px;padding:2px 6px;">
                      <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-1px;">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>`;
                })()
              : ''}
          </td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">PDF de Cotización</td>
          <td>
            ${oc.archivo_url 
              ? `<a href="${oc.archivo_url}" target="_blank" class="btn btn-sm btn-outline">📄 Ver PDF</a>` 
              : '<span class="text-muted">—</span>'}
          </td></tr>
    </table>
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid #f0f0f0">
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px">Descripción del requerimiento</div>
      <p style="margin:0;line-height:1.6;font-size:13px">${oc.descripcion}</p>
    </div>

    ${oc.items && oc.items.length > 0 ? `
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid #f0f0f0">
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px">Ítems / Líneas de la OC ${oc.cotizacion_id ? '(según cotización seleccionada)' : '(según requerimiento — sin cotización)'}</div>
      <table style="width:100%; font-size:12px; border-collapse:collapse;">
        <thead><tr style="background:#f8f9fa">
          <th style="text-align:left;padding:3px 4px;">Descripción</th>
          <th style="text-align:right;padding:3px 4px;">Cant.</th>
          <th style="text-align:right;padding:3px 4px;">Precio unit.</th>
        </tr></thead>
        <tbody>
          ${oc.items.map(it => {
            const desc = it.descripcion || (it.codigo ? (it.codigo + ' — ' + (it.descripcion||'')) : '—');
            const cant = parseFloat(it.cantidad || 0).toLocaleString('es-MX');
            let precio = '—';
            if (it.precio_unitario != null) {
              precio = '$' + Number(it.precio_unitario).toLocaleString('es-MX');
            } else if (it.precio_unitario_referencia != null) {
              precio = '$' + Number(it.precio_unitario_referencia).toLocaleString('es-MX') + ' (ref)';
            }
            const unidad = it.unidad ? ' ' + it.unidad : '';
            return `<tr>
              <td style="padding:3px 4px; border-bottom:1px solid #eee;">${desc}${unidad}</td>
              <td style="padding:3px 4px; border-bottom:1px solid #eee; text-align:right;">${cant}</td>
              <td style="padding:3px 4px; border-bottom:1px solid #eee; text-align:right;">${precio}</td>
            </tr>`;
          }).join('')}
        </tbody>
        ${(() => {
            const total = oc.items.reduce((sum, it) => {
              const c = parseFloat(it.cantidad || 0);
              let p = 0;
              if (it.precio_unitario != null) {
                p = parseFloat(it.precio_unitario);
              } else if (it.precio_unitario_referencia != null) {
                p = parseFloat(it.precio_unitario_referencia);
              }
              return sum + (c * p);
            }, 0);
            const moneda = oc.moneda || 'MXN';
            const label = oc.cotizacion_id 
              ? 'Total cotización / OC' 
              : 'Total (precios de referencia del catálogo)';
            return `<tfoot><tr style="font-weight:600; border-top:2px solid #ccc;">
              <td colspan="2" style="padding:4px 4px; text-align:right;">${label}</td>
              <td style="padding:4px 4px; text-align:right;">$${total.toLocaleString('es-MX')} ${moneda}</td>
            </tr></tfoot>`;
          })()}
      </table>
      <div style="font-size:11px; color:#64748b; margin-top:4px;">${oc.cotizacion_id ? 'Precios según la cotización elegida. Total calculado de líneas.' : 'Precios de referencia del catálogo (el precio real puede variar). Para fijar proveedor y precios use el flujo de cotización.'}</div>
    </div>` : '' }`;

  // Historial
  const tl = document.getElementById('historial-timeline');
  if (!oc.historial?.length) {
    tl.innerHTML = '<p class="text-muted text-sm">Sin historial</p>';
  } else {
    tl.innerHTML = oc.historial.map(h => `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-date">${UI.fecha(h.created_at)} · ${h.cambiado_por}</div>
        <div class="timeline-text">
          ${h.estado_anterior
            ? `${UI.badge(h.estado_anterior)} → ${UI.badge(h.estado_nuevo)}`
            : `OC creada como ${UI.badge(h.estado_nuevo)}`}
          ${h.notas ? `<div class="text-sm text-muted mt-2">${h.notas}</div>` : ''}
        </div>
      </div>`).join('');
  }

  renderAcciones(oc);

  // Delegación para acciones de la OC
  const accionesPanel = document.getElementById('panel-acciones');
  if (accionesPanel && !accionesPanel.dataset.delegateAttached) {
    accionesPanel.dataset.delegateAttached = 'true';

    window.delegate(accionesPanel, 'button[data-action]', 'click', (e, btn) => {
      const action = btn.dataset.action;
      if (action === 'abrirRecepcion') abrirRecepcion();
    });

    window.delegate(accionesPanel, 'button[data-estado]', 'click', (e, btn) => {
      const estado = btn.dataset.estado;
      const label = btn.dataset.label;
      if (estado) prepararCambioEstado(estado, label);
    });
  }

  // Mostrar botón recepción solo cuando aplica
  const btnRec = document.getElementById('btn-nueva-recepcion');
  const puedeRecepcionar = Auth.puedeHacer(['contabilidad','admin']) &&
    ['distribuida','en_proceso'].includes(oc.estado);
  btnRec.style.display = puedeRecepcionar ? '' : 'none';
}

function renderAcciones(oc) {
  const panel = document.getElementById('panel-acciones');
  const u = Auth.getUsuario();

  const TRANSICIONES = {
    generada:    [{ label:'Distribuir',    estado:'distribuida', clase:'btn-primary' }],
    distribuida: [{ label:'En proceso',    estado:'en_proceso',  clase:'btn-primary' },
                  { label:'Cancelar OC',   estado:'cancelada',   clase:'btn-danger'  }],
    en_proceso:  [{ label:'Registrar recepción', accion:'abrirRecepcion', clase:'btn-success' },
                  { label:'Cancelar OC',   estado:'cancelada',   clase:'btn-danger'  }],
    recibida:    [{ label:'Cerrar OC',     estado:'cerrada',     clase:'btn-success' }],
  };

  const opciones = TRANSICIONES[oc.estado];
  const puedeActuar = ['contabilidad','admin'].includes(u.rol);

  if (!opciones || !puedeActuar) { panel.style.display = 'none'; return; }

  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="card-title">Acciones</div>
    <div class="stacked-actions">
      ${opciones.map(a => {
        if (a.accion) {
          return `<button class="btn ${a.clase}" data-action="${a.accion}">${a.label}</button>`;
        } else {
          return `<button class="btn ${a.clase}" data-estado="${a.estado}" data-label="${a.label}">${a.label}</button>`;
        }
      }).join('')}
    </div>`;
}

function cerrarModalRecepcion() {
  recepcionEditandoId = null;
  document.getElementById('rec-id').value = '';
  document.getElementById('form-recepcion').reset();
  document.getElementById('rec-items-list').innerHTML = '';
  const titulo = document.getElementById('modal-recepcion-titulo');
  const btn = document.getElementById('btn-guardar-recepcion');
  if (titulo) titulo.textContent = 'Registrar recepción';
  if (btn) btn.textContent = 'Confirmar recepción';
  UI.cerrarModal('modal-recepcion');
}

async function cargarResumenItemsOc(ocId) {
  try {
    resumenItemsOc = await Api.get(`/ordenes-compra/${ocId}/recepciones/resumen-items`);
  } catch (err) {
    console.error('Error cargando resumen de ítems:', err);
    resumenItemsOc = [];
  }
  return resumenItemsOc;
}

function renderLineasRecepcionModal(itemsResumen, itemsRecepcion = []) {
  const contenedor = document.getElementById('rec-items-list');
  if (!contenedor) return;

  if (!itemsResumen.length) {
    contenedor.innerHTML = '<div class="text-muted text-sm" style="padding:10px;">Esta OC no tiene ítems desglosados.</div>';
    return;
  }

  const mapRec = {};
  (itemsRecepcion || []).forEach(it => {
    mapRec[it.item_key] = parseFloat(it.cantidad_recibida) || 0;
  });

  contenedor.innerHTML = `
    <table style="width:100%; font-size:12px; border-collapse:collapse;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:6px 8px; text-align:center; width:36px;">✓</th>
          <th style="padding:6px 8px; text-align:left;">Ítem</th>
          <th style="padding:6px 8px; text-align:right;">Solic.</th>
          <th style="padding:6px 8px; text-align:right;">Recib.</th>
          <th style="padding:6px 8px; text-align:right;">Pend.</th>
          <th style="padding:6px 8px; text-align:right; width:90px;">Esta recep.</th>
        </tr>
      </thead>
      <tbody>
        ${itemsResumen.map(it => {
          const pendiente = Math.max(0, parseFloat(it.pendiente) || 0);
          const prefill = mapRec[it.item_key] != null
            ? mapRec[it.item_key]
            : (recepcionEditandoId ? 0 : pendiente);
          const checked = recepcionEditandoId
            ? (mapRec[it.item_key] > 0)
            : (pendiente > 0);
          const desc = it.codigo
            ? `<strong>${it.codigo}</strong> — ${it.descripcion}`
            : it.descripcion;
          return `
            <tr class="rec-item-row" data-item-key="${it.item_key}" style="border-top:1px solid #e5e7eb;">
              <td style="padding:6px 8px; text-align:center;">
                <input type="checkbox" class="rec-item-check" ${checked ? 'checked' : ''}>
              </td>
              <td style="padding:6px 8px;">${desc}<div class="text-muted" style="font-size:10px;">${it.unidad || 'pieza'}</div></td>
              <td style="padding:6px 8px; text-align:right;">${parseFloat(it.cantidad_solicitada || 0).toLocaleString('es-MX')}</td>
              <td style="padding:6px 8px; text-align:right;">${parseFloat(it.cantidad_recibida || 0).toLocaleString('es-MX')}</td>
              <td style="padding:6px 8px; text-align:right;">${pendiente.toLocaleString('es-MX')}</td>
              <td style="padding:6px 8px; text-align:right;">
                <input type="number" class="form-control form-control-sm rec-item-cantidad"
                       min="0" step="0.01" value="${prefill > 0 ? prefill : ''}"
                       placeholder="0" style="width:84px; text-align:right;">
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  contenedor.querySelectorAll('.rec-item-check').forEach(chk => {
    chk.addEventListener('change', () => {
      const row = chk.closest('.rec-item-row');
      const input = row?.querySelector('.rec-item-cantidad');
      if (!input) return;
      if (!chk.checked) {
        input.value = '';
        input.disabled = true;
      } else {
        input.disabled = false;
        if (!input.value) {
          const pend = row.querySelector('td:nth-child(5)')?.textContent?.replace(/,/g, '') || '0';
          input.value = parseFloat(pend) || '';
        }
      }
    });
    chk.dispatchEvent(new Event('change'));
  });
}

function recolectarItemsRecepcionFormulario() {
  const items = [];
  document.querySelectorAll('#rec-items-list .rec-item-row').forEach(row => {
    const check = row.querySelector('.rec-item-check');
    if (!check?.checked) return;

    const cantidad = parseFloat(row.querySelector('.rec-item-cantidad')?.value) || 0;
    if (cantidad <= 0) return;

    const key = row.dataset.itemKey;
    const resumen = (resumenItemsOc || []).find(i => i.item_key === key) || {};

    items.push({
      item_key: key,
      descripcion: resumen.descripcion || null,
      codigo: resumen.codigo || null,
      cantidad_solicitada: parseFloat(resumen.cantidad_solicitada) || 0,
      cantidad_recibida: cantidad,
      unidad: resumen.unidad || null,
    });
  });
  return items;
}

async function abrirRecepcion(recepcion = null) {
  if (!ocActual) return;

  recepcionEditandoId = recepcion?.id || null;
  document.getElementById('rec-id').value = recepcionEditandoId || '';
  document.getElementById('form-recepcion').reset();

  const titulo = document.getElementById('modal-recepcion-titulo');
  const btn = document.getElementById('btn-guardar-recepcion');
  if (titulo) titulo.textContent = recepcionEditandoId ? 'Editar recepción' : 'Registrar recepción';
  if (btn) btn.textContent = recepcionEditandoId ? 'Guardar cambios' : 'Confirmar recepción';

  if (recepcion) {
    document.getElementById('rec-estado').value = recepcion.estado || 'recibido_completo';
    document.getElementById('rec-notas').value = recepcion.notas || '';
    document.getElementById('rec-datatextnow').value = recepcion.datatextnow_id || ocActual.datatextnow_id || '';
  } else {
    const poInput = document.getElementById('rec-datatextnow');
    if (poInput && ocActual.datatextnow_id) poInput.value = ocActual.datatextnow_id;
  }

  const loading = document.getElementById('rec-items-loading');
  if (loading) loading.style.display = 'block';
  document.getElementById('rec-items-list').innerHTML = '';

  await cargarResumenItemsOc(ocActual.id);
  if (loading) loading.style.display = 'none';
  renderLineasRecepcionModal(resumenItemsOc, recepcion?.items || []);

  actualizarAvisoCierreRecepcion();
  UI.abrirModal('modal-recepcion');
}

async function editarRecepcion(recId) {
  if (!Auth.puedeHacer(['contabilidad', 'admin'])) return;
  const recepcion = (recepcionesActuales || []).find(r => r.id === recId);
  if (!recepcion) return Toast.error('Recepción no encontrada');
  await abrirRecepcion(recepcion);
}

async function eliminarRecepcion(recId) {
  if (!Auth.puedeHacer(['contabilidad', 'admin'])) return;
  if (!confirm('¿Eliminar esta recepción?\nSe actualizarán los avances de ítems recibidos.')) return;

  try {
    await Api.delete(`/ordenes-compra/${ocActual.id}/recepciones/${recId}`);
    Toast.success('Recepción eliminada');
    abrirDetalle(ocActual.id);
  } catch (err) {
    Toast.error(err.mensaje || 'Error al eliminar recepción');
  }
}

function prepararCambioEstado(estado, label) {
  if (estado === 'distribuida') {
    const registrar = confirm(
      '¿Deseas registrar una recepción ahora?\n\n'
      + '• Aceptar: marcar como distribuida y abrir el registro de recepción (la OC pasará a "En proceso").\n'
      + '• Cancelar: solo marcar como distribuida.'
    );

    (async () => {
      try {
        await Api.patch(`/ordenes-compra/${ocActual.id}/estado`, {
          estado: 'distribuida',
          notas: '',
        });
        Toast.success('OC marcada como distribuida');
        await abrirDetalle(ocActual.id);
        if (registrar) await abrirRecepcion();
      } catch (err) {
        Toast.error(err.mensaje || 'Error al cambiar estado');
      }
    })();
    return;
  }

  document.getElementById('modal-estado-titulo').textContent = label;
  document.getElementById('estado-notas').value = '';
  UI.abrirModal('modal-estado');

  document.getElementById('btn-confirmar-estado').onclick = async () => {
    try {
      await Api.patch(`/ordenes-compra/${ocActual.id}/estado`, {
        estado, notas: document.getElementById('estado-notas').value,
      });
      UI.cerrarModal('modal-estado');
      Toast.success('Estado actualizado');
      abrirDetalle(ocActual.id);
    } catch (err) {
      Toast.error(err.mensaje || 'Error al cambiar estado');
    }
  };
}

// ── Recepciones ───────────────────────────────────────────────
async function cargarRecepciones(ocId) {
  const contenedor = document.getElementById('lista-recepciones');
  let recs = [];

  try {
    recs = await Api.get(`/ordenes-compra/${ocId}/recepciones`);
    recepcionesActuales = recs;
    await cargarResumenItemsOc(ocId);

    const esContab = Auth.puedeHacer(['contabilidad', 'admin']);

    if (!recs.length) {
      contenedor.innerHTML = '<p class="text-muted text-sm">Sin recepciones registradas</p>';
    } else {
      contenedor.innerHTML = recs.map(r => {
        const itemsHtml = (r.items && r.items.length)
          ? `<ul style="margin:8px 0 0; padding-left:16px; font-size:12px; color:#475569;">
              ${r.items.map(it => `
                <li>${it.codigo ? `<strong>${it.codigo}</strong> — ` : ''}${it.descripcion || 'Ítem'}
                    · <strong>${parseFloat(it.cantidad_recibida || 0).toLocaleString('es-MX')}</strong>
                    ${it.unidad ? it.unidad : ''}
                </li>`).join('')}
            </ul>`
          : '';

        const accionesContab = esContab ? `
          <div class="d-flex gap-1 mt-2">
            <button class="btn btn-sm btn-outline" data-action="editar-recepcion" data-rec-id="${r.id}">Editar</button>
            <button class="btn btn-sm btn-danger" data-action="eliminar-recepcion" data-rec-id="${r.id}">Eliminar</button>
          </div>` : '';

        return `
        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:10px">
          <div class="d-flex align-center justify-between">
            ${UI.badge(r.estado)}
            <span class="text-sm text-muted">${UI.fecha(r.fecha_recepcion)}</span>
          </div>
          <div style="margin-top:6px;font-size:13px;color:#6b7280">
            Recibido por: ${r.recibido_por_nombre}
            ${r.datatextnow_id ? ' · Trans. DataTextNow: ' + r.datatextnow_id : ''}
          </div>
          ${r.notas ? `<div class="text-sm text-muted mt-2">${r.notas}</div>` : ''}
          ${itemsHtml}
          ${accionesContab}
        </div>`;
      }).join('');
    }
  } catch {
    contenedor.innerHTML = '<p class="text-muted text-sm">Error al cargar recepciones</p>';
  }

  renderResumenAvance(recs);

  const listaRec = document.getElementById('lista-recepciones');
  if (listaRec && !listaRec.dataset.delegateAttached) {
    listaRec.dataset.delegateAttached = 'true';
    window.delegate(listaRec, 'button[data-action="editar-recepcion"]', 'click', (e, btn) => {
      const recId = parseInt(btn.dataset.recId, 10);
      if (recId) editarRecepcion(recId);
    });
    window.delegate(listaRec, 'button[data-action="eliminar-recepcion"]', 'click', (e, btn) => {
      const recId = parseInt(btn.dataset.recId, 10);
      if (recId) eliminarRecepcion(recId);
    });
  }

  if (ocActual && ocActual.estado === 'recibida') {
    const closeBtn = document.querySelector('#panel-acciones button[data-estado="cerrada"]');
    const tienePO = !!(ocActual.datatextnow_id && String(ocActual.datatextnow_id).trim())
      || recs.some(r => r.datatextnow_id && String(r.datatextnow_id).trim());
    const itemsCompletos = (resumenItemsOc || []).length > 0
      && (resumenItemsOc || []).every(it => (parseFloat(it.pendiente) || 0) <= 0);
    const listasParaCierre = itemsCompletos || (recs.length > 0 && recs.every(r =>
      r.estado === 'recibido_completo'
    ));

    if (closeBtn) {
      if (!listasParaCierre || !tienePO) {
        closeBtn.disabled = true;
        closeBtn.title = !recs.length
          ? 'Registra al menos una recepción antes de cerrar la OC'
          : !tienePO
            ? 'Falta registrar el PO de DataTextNow para cerrar la OC'
            : 'Hay recepciones parciales pendientes de completar';
      } else {
        closeBtn.disabled = false;
        closeBtn.title = 'Cerrar la OC';
      }
    }
  }
}

// ── Resumen de Avance para Cierre de OC ───────────────────────
function renderResumenAvance(recepciones) {
  const contenedor = document.getElementById('resumen-avance-oc');
  if (!contenedor || !ocActual) return;

  const items = resumenItemsOc || [];
  const totalRecep = recepciones.length;

  let mensaje = '';
  let color = '#166534';
  let porcentaje = 0;

  const tienePO = !!(ocActual.datatextnow_id && String(ocActual.datatextnow_id).trim())
    || recepciones.some(r => r.datatextnow_id && String(r.datatextnow_id).trim());

  if (items.length) {
    const completos = items.filter(it => (parseFloat(it.pendiente) || 0) <= 0).length;
    porcentaje = Math.round((completos / items.length) * 100);

    if (ocActual.estado === 'cerrada') {
      mensaje = '✅ La OC está cerrada.';
    } else if (completos === items.length) {
      mensaje = tienePO
        ? '✅ Todos los ítems recibidos. La OC puede cerrarse.'
        : '✅ Ítems completos, pero <strong>falta el PO de DataTextNow</strong> para cerrar la OC.';
      color = tienePO ? '#166534' : '#854d0e';
    } else {
      mensaje = `<strong>${completos}</strong> de <strong>${items.length}</strong> ítems completamente recibidos.`;
      color = '#854d0e';
    }
  } else if (totalRecep === 0) {
    mensaje = 'Aún no hay recepciones registradas.';
    color = '#64748b';
  } else {
    const listas = recepciones.filter(r => r.estado === 'recibido_completo').length;
    porcentaje = Math.round((listas / totalRecep) * 100);
    mensaje = `${listas} de ${totalRecep} recepción(es) marcadas como completas.`;
    color = listas === totalRecep ? '#166534' : '#854d0e';
  }

  const tablaItems = items.length ? `
    <table style="width:100%; font-size:11.5px; border-collapse:collapse; margin-top:10px;">
      <thead>
        <tr style="background:#e2e8f0;">
          <th style="text-align:left; padding:4px 6px;">Ítem</th>
          <th style="text-align:right; padding:4px 6px;">Solicitado</th>
          <th style="text-align:right; padding:4px 6px;">Recibido</th>
          <th style="text-align:right; padding:4px 6px;">Pendiente</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(it => {
          const pend = parseFloat(it.pendiente) || 0;
          const rowColor = pend <= 0 ? '#166534' : '#b45309';
          return `
            <tr>
              <td style="padding:4px 6px; border-top:1px solid #e2e8f0;">
                ${it.codigo ? `<strong>${it.codigo}</strong> — ` : ''}${it.descripcion}
              </td>
              <td style="padding:4px 6px; border-top:1px solid #e2e8f0; text-align:right;">
                ${parseFloat(it.cantidad_solicitada || 0).toLocaleString('es-MX')} ${it.unidad || ''}
              </td>
              <td style="padding:4px 6px; border-top:1px solid #e2e8f0; text-align:right;">
                ${parseFloat(it.cantidad_recibida || 0).toLocaleString('es-MX')}
              </td>
              <td style="padding:4px 6px; border-top:1px solid #e2e8f0; text-align:right; color:${rowColor}; font-weight:600;">
                ${pend.toLocaleString('es-MX')}
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>` : '';

  contenedor.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <div style="font-weight:600;">Avance de recepción por ítem</div>
      ${items.length ? `<div style="font-weight:700; color:#185FA5;">${porcentaje}%</div>` : ''}
    </div>

    <div style="background:#e2e8f0; height:10px; border-radius:5px; overflow:hidden; margin-bottom:8px;">
      <div style="width:${porcentaje}%; height:100%; background:${color}; transition: width 0.4s ease;"></div>
    </div>

    <div style="font-size:12.5px; color:#475569;">${mensaje}</div>
    ${tablaItems}

    <div style="margin-top:8px; font-size:11px; color:#64748b;">
      Estado actual de la OC: <strong>${UI.badge(ocActual.estado)}</strong>
      · Recepciones registradas: <strong>${totalRecep}</strong>
      ${!tienePO ? '<br><span style="color:#b45309">⚠️ Falta PO de DataTextNow para permitir cierre</span>' : ''}
    </div>
  `;
}

document.getElementById('form-recepcion').addEventListener('submit', async e => {
  e.preventDefault();

  const estado = document.getElementById('rec-estado').value;
  const poNuevo = document.getElementById('rec-datatextnow').value || null;
  const notas = document.getElementById('rec-notas').value || null;
  const items = recolectarItemsRecepcionFormulario();
  const esCompleta = estado !== 'recibido_parcial';
  const editId = recepcionEditandoId || parseInt(document.getElementById('rec-id')?.value, 10) || null;

  if (!items.length) {
    return Toast.error('Selecciona al menos un ítem con cantidad recibida mayor a 0');
  }

  if (!editId && esCompleta && ocActual?.estado !== 'cerrada') {
    const recsProyectadas = [
      ...(recepcionesActuales || []),
      { estado: 'recibido_completo', datatextnow_id: poNuevo },
    ];
    const evaluacion = evaluarCierreOc(ocActual, recsProyectadas, { poNuevo });
    const mensaje = mensajeConfirmacionCierreRecepcion(evaluacion);
    if (mensaje && !confirm(mensaje)) return;
  }

  const payload = { estado, datatextnow_id: poNuevo, notas, items };

  try {
    let resp;
    if (editId) {
      resp = await Api.put(`/ordenes-compra/${ocActual.id}/recepciones/${editId}`, payload);
      cerrarModalRecepcion();
      Toast.success('Recepción actualizada');
    } else {
      resp = await Api.post(`/ordenes-compra/${ocActual.id}/recepciones`, payload);
      cerrarModalRecepcion();

      if (resp.oc_cerrada) {
        Toast.success('Recepción registrada y OC cerrada automáticamente');
      } else if (resp.pendiente_po) {
        Toast.info('Recepción registrada. Registra el PO de DataTextNow para cerrar la OC.');
      } else {
        Toast.success('Recepción registrada');
      }
    }

    abrirDetalle(ocActual.id);
  } catch (err) {
    Toast.error(err.mensaje || 'Error al guardar recepción');
  }
});

['rec-estado', 'rec-datatextnow'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', actualizarAvisoCierreRecepcion);
  if (el && el.tagName === 'SELECT') el.addEventListener('change', actualizarAvisoCierreRecepcion);
});

const busqOcInput = document.getElementById('fil-busqueda-oc');
if (busqOcInput) {
  busqOcInput.addEventListener('input', window.debounce(() => cargarOrdenes(1), 300));
}

window.abrirRecepcion = abrirRecepcion;
window.cerrarModalRecepcion = cerrarModalRecepcion;
window.editarRecepcion = editarRecepcion;
window.eliminarRecepcion = eliminarRecepcion;


