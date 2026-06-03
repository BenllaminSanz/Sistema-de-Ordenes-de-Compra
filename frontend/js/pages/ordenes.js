/**
 * ordenes.js
 * Lógica de la página de Órdenes de Compra
 */

Auth.requiereAuth();
renderSidebar();
renderTopbar('Órdenes de Compra');

let ocActual = null;

const params = new URLSearchParams(window.location.search);
if (params.get('id')) {
  abrirDetalle(params.get('id'));
} else {
  cargarOrdenes(1);
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

  const estado = document.getElementById('fil-estado').value;
  let qs = `?pagina=${pagina}&limite=15`;
  if (estado) qs += `&estado=${estado}`;

  try {
    const { datos, total, limite } = await Api.get('/ordenes-compra' + qs);

    if (!datos.length) { UI.empty(contenedor, 'No hay órdenes de compra'); return; }

    contenedor.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Número OC</th><th>PO DTN</th><th>Requerimiento</th><th>Tipo</th>
            <th>Proveedor</th><th>Monto</th><th>Autorizado por</th>
            <th>Estado</th><th>Fecha</th><th></th>
          </tr></thead>
          <tbody>${datos.map(o => `
            <tr>
              <td class="fw-600">${o.numero_oc}</td>
              <td class="text-muted small">${o.datatextnow_id || '—'}</td>
              <td>${o.consecutivo}</td>
              <td>${o.tipo}</td>
              <td>${o.proveedor_nombre || '—'}</td>
              <td>${o.monto_total
                    ? '$' + Number(o.monto_total).toLocaleString('es-MX') + ' ' + o.moneda
                    : '—'}</td>
              <td>${o.autorizado_por_nombre}</td>
              <td>${UI.badge(o.estado)}</td>
              <td class="text-muted text-sm">${UI.fecha(o.created_at)}</td>
              <td>
                <button class="btn btn-sm btn-outline" data-action="ver-oc" data-id="${o.id}">Ver</button>
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
      <tr><td style="padding:6px 0;color:#6b7280">Solicitante</td>
          <td><strong>${oc.solicitante_nombre || '—'}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Tipo</td>
          <td>${oc.tipo}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Proveedor</td>
          <td>${oc.proveedor_nombre || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Monto</td>
          <td>${oc.monto_total
                ? '$' + Number(oc.monto_total).toLocaleString('es-MX') + ' ' + oc.moneda
                : '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Autorizado por</td>
          <td>${oc.autorizado_por_nombre}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Fecha autorización</td>
          <td>${UI.fecha(oc.fecha_autorizacion)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">PO en DataTextNow</td>
          <td>
            ${oc.datatextnow_id || '—'}
            ${Auth.puedeHacer(['contabilidad','admin']) 
              ? (() => {
                  const safe = String(oc.datatextnow_id || '').replace(/'/g, "\\'");
                  return `<button onclick="editarDataTextNowOC(${oc.id}, '${safe}')" 
                             class="btn btn-sm btn-outline" style="margin-left:8px;padding:2px 6px;font-size:11px">✏️ Editar</button>`;
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
      </table>
      <div style="font-size:11px; color:#64748b; margin-top:4px;">${oc.cotizacion_id ? 'Precios según la cotización elegida.' : 'Precios de referencia del catálogo (el precio real puede variar). Para fijar proveedor y precios use el flujo de cotización.'}</div>
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

function abrirRecepcion() {
  UI.abrirModal('modal-recepcion');
}

function prepararCambioEstado(estado, label) {
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

    if (!recs.length) {
      contenedor.innerHTML = '<p class="text-muted text-sm">Sin recepciones registradas</p>';
    } else {
      contenedor.innerHTML = recs.map(r => `
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
          ${r.estado !== 'entregado_solicitante' && 
            (Auth.puedeHacer(['contabilidad','admin']) || 
             (Auth.getUsuario()?.id === ocActual?.solicitante_id))
            ? `<button class="btn btn-sm btn-outline mt-2"
                       data-action="marcar-entregado" data-rec-id="${r.id}">
                ${Auth.getUsuario()?.rol === 'solicitante' ? 'Confirmar que recibí' : 'Marcar entregado al solicitante'}
              </button>`
            : ''}
        </div>`).join('');
    }
  } catch {
    contenedor.innerHTML = '<p class="text-muted text-sm">Error al cargar recepciones</p>';
  }

  // Siempre renderizar el resumen (incluso si no hay recepciones)
  renderResumenAvance(recs);

  // Delegación para marcar entregado
  const listaRec = document.getElementById('lista-recepciones');
  if (listaRec && !listaRec.dataset.delegateAttached) {
    listaRec.dataset.delegateAttached = 'true';
    window.delegate(listaRec, 'button[data-action="marcar-entregado"]', 'click', (e, btn) => {
      const recId = parseInt(btn.dataset.recId);
      if (recId) marcarEntregado(recId);
    });
  }
}

// ── Resumen de Avance para Cierre de OC ───────────────────────
function renderResumenAvance(recepciones) {
  const contenedor = document.getElementById('resumen-avance-oc');
  if (!contenedor || !ocActual) return;

  const total = recepciones.length;
  if (total === 0) {
    contenedor.innerHTML = `
      <div style="font-weight:600; margin-bottom:4px;">Avance para cierre</div>
      <div style="color:#64748b;">Aún no hay recepciones registradas.</div>
    `;
    return;
  }

  const confirmadas = recepciones.filter(r => r.estado === 'entregado_solicitante').length;
  const porcentaje = Math.round((confirmadas / total) * 100);

  let mensaje = '';
  let color = '#166534';

  if (confirmadas === total) {
    mensaje = '✅ Todas las recepciones han sido confirmadas por el solicitante. La OC puede cerrarse.';
    color = '#166534';
  } else {
    mensaje = `Faltan <strong>${total - confirmadas}</strong> confirmación(es) del solicitante para poder cerrar la OC.`;
    color = '#854d0e';
  }

  contenedor.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <div style="font-weight:600;">Avance de confirmación por el solicitante</div>
      <div style="font-weight:700; color:#185FA5;">${confirmadas} / ${total}</div>
    </div>

    <div style="background:#e2e8f0; height:10px; border-radius:5px; overflow:hidden; margin-bottom:8px;">
      <div style="width:${porcentaje}%; height:100%; background:${color}; transition: width 0.4s ease;"></div>
    </div>

    <div style="font-size:12.5px; color:#475569;">
      ${mensaje}
    </div>

    <div style="margin-top:6px; font-size:11px; color:#64748b;">
      Estado actual de la OC: <strong>${UI.badge(ocActual.estado)}</strong><br>
      Responsable de confirmar: <strong>${ocActual.solicitante_nombre || '—'}</strong>
    </div>
  `;
}

async function marcarEntregado(recId) {
  try {
    await Api.patch(`/ordenes-compra/${ocActual.id}/recepciones/${recId}/entregar`, {});
    Toast.success('Marcado como entregado');
    abrirDetalle(ocActual.id);
  } catch (err) {
    Toast.error(err.mensaje || 'Error al actualizar');
  }
}

document.getElementById('form-recepcion').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await Api.post(`/ordenes-compra/${ocActual.id}/recepciones`, {
      estado:        document.getElementById('rec-estado').value,
      datatextnow_id:document.getElementById('rec-datatextnow').value || null,
      notas:         document.getElementById('rec-notas').value || null,
    });
    UI.cerrarModal('modal-recepcion');
    Toast.success('Recepción registrada');
    abrirDetalle(ocActual.id);
  } catch (err) {
    Toast.error(err.mensaje || 'Error al registrar recepción');
  }
});


