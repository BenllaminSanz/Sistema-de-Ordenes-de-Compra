/**
 * ordenes.js
 * Lógica de la página de Órdenes de Compra
 */

Auth.requiereAuth();
renderSidebar();
renderTopbar('Órdenes de Compra');

let ocActual = null;
let recepcionesActuales = [];

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

function mensajeConfirmacionEntregaSolicitante(evaluacion) {
  if (evaluacion.ok) {
    return 'Al confirmar que ya recibiste el material, das por cerrada tu Orden de Compra.\n\n'
      + 'Esta acción es definitiva y no se puede deshacer.\n\n'
      + '¿Confirmas que ya recibiste y deseas cerrar la OC?';
  }
  if (evaluacion.motivo === 'sin_po') {
    return 'Al confirmar que ya recibiste el material, registras tu conformidad con la entrega.\n\n'
      + 'La OC se cerrará cuando Contabilidad registre el PO de DataTextNow.\n\n'
      + '¿Confirmas que ya recibiste?';
  }
  return 'Al confirmar que ya recibiste el material, registras tu conformidad con esta entrega.\n\n'
    + '¿Confirmas que ya recibiste?';
}

function mensajeConfirmacionEntregaContabilidad(evaluacion) {
  if (evaluacion.ok) {
    return 'Se cumplen los requisitos para cerrar la Orden de Compra.\n\n'
      + 'Al marcar como entregado al solicitante, la OC se cerrará automáticamente.\n\n'
      + '¿Deseas continuar?';
  }
  return '¿Marcar esta recepción como entregada al solicitante?';
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

  const usuario = Auth.getUsuario();
  const esSolicitante = usuario?.rol === 'solicitante';
  const esAdminOContab = !esSolicitante;

  // Ajustar título y subtítulo según rol (vista de solicitante)
  const cardTitle = document.querySelector('#vista-lista .card-title');
  const subtitle = document.getElementById('oc-subtitle');

  if (cardTitle) {
    cardTitle.textContent = 'Órdenes de Compra';
  }

  if (subtitle) {
    if (esSolicitante) {
      subtitle.innerHTML = 'Solo se muestran las Órdenes de Compra que nacen de <strong>tus requerimientos aprobados</strong>.';
      subtitle.style.cssText = 'font-size:13px;color:#64748b;margin-top:-4px;margin-bottom:10px;padding:6px 10px;background:#f1f5f9;border-radius:6px;';
      subtitle.style.display = '';
    } else {
      subtitle.textContent = '';
      subtitle.style.display = 'none';
    }
  }

  const estado = document.getElementById('fil-estado').value;
  let qs = `?pagina=${pagina}&limite=15`;
  if (estado) qs += `&estado=${estado}`;

  try {
    const { datos, total, limite } = await Api.get('/ordenes-compra' + qs);

    if (!datos.length) {
      UI.empty(contenedor, esSolicitante 
        ? 'No tienes órdenes de compra generadas a partir de tus requerimientos.' 
        : 'No hay órdenes de compra');
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

function abrirRecepcion() {
  const poInput = document.getElementById('rec-datatextnow');
  if (poInput && ocActual?.datatextnow_id && !poInput.value) {
    poInput.value = ocActual.datatextnow_id;
  }
  actualizarAvisoCierreRecepcion();
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
    recepcionesActuales = recs;

    if (!recs.length) {
      contenedor.innerHTML = '<p class="text-muted text-sm">Sin recepciones registradas</p>';
    } else {
      contenedor.innerHTML = recs.map(r => {
        const puedeConfirmar = r.estado !== 'entregado_solicitante'
          && (Auth.puedeHacer(['contabilidad', 'admin'])
            || (Auth.getUsuario()?.id === ocActual?.solicitante_id));
        const esSolicitante = Auth.getUsuario()?.rol === 'solicitante';
        const recsProyectadas = recs.map(x =>
          x.id === r.id ? { ...x, estado: 'entregado_solicitante' } : x
        );
        const evalEntrega = evaluarCierreOc(ocActual, recsProyectadas);
        const avisoSolicitante = esSolicitante && puedeConfirmar
          ? (evalEntrega.ok
            ? '<p class="text-sm mt-2" style="font-size:11px;color:#b45309;margin-bottom:0;">'
              + '⚠️ Al confirmar, das por <strong>recibida y cerrada</strong> tu Orden de Compra.</p>'
            : '<p class="text-sm mt-2" style="font-size:11px;color:#64748b;margin-bottom:0;">'
              + 'Al confirmar, registras que ya recibiste este material.</p>')
          : '';

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
          ${puedeConfirmar
            ? `<button class="btn btn-sm btn-outline mt-2"
                       data-action="marcar-entregado" data-rec-id="${r.id}">
                ${esSolicitante ? 'Confirmar que recibí' : 'Marcar entregado al solicitante'}
              </button>${avisoSolicitante}`
            : ''}
        </div>`;
      }).join('');
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

  if (ocActual && ocActual.estado === 'recibida') {
    const closeBtn = document.querySelector('#panel-acciones button[data-estado="cerrada"]');
    const tienePO = !!(ocActual.datatextnow_id && String(ocActual.datatextnow_id).trim())
      || recs.some(r => r.datatextnow_id && String(r.datatextnow_id).trim());
    const listasParaCierre = recs.length > 0 && recs.every(r =>
      r.estado === 'entregado_solicitante' || r.estado === 'recibido_completo'
    );

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

  const total = recepciones.length;
  if (total === 0) {
    contenedor.innerHTML = `
      <div style="font-weight:600; margin-bottom:4px;">Avance para cierre</div>
      <div style="color:#64748b;">Aún no hay recepciones registradas.</div>
    `;
    return;
  }

  const listas = recepciones.filter(r =>
    r.estado === 'entregado_solicitante' || r.estado === 'recibido_completo'
  ).length;
  const porcentaje = Math.round((listas / total) * 100);

  let mensaje = '';
  let color = '#166534';

  const tienePO = !!(ocActual && ocActual.datatextnow_id && String(ocActual.datatextnow_id).trim())
    || recepciones.some(r => r.datatextnow_id && String(r.datatextnow_id).trim());
  const puedeCerrar = (listas === total) && tienePO;

  if (ocActual.estado === 'cerrada') {
    mensaje = '✅ La OC está cerrada.';
    color = '#166534';
  } else if (listas === total) {
    if (tienePO) {
      mensaje = '✅ Recepciones completas. La OC puede cerrarse (o se cerrará automáticamente al registrar recibido completo).';
      color = '#166534';
    } else {
      mensaje = '✅ Recepciones registradas, pero <strong>falta el PO de DataTextNow</strong> para poder cerrar la OC.';
      color = '#854d0e';
    }
  } else {
    mensaje = `Hay <strong>${total - listas}</strong> recepción(es) parcial(es) pendientes de completar.`;
    color = '#854d0e';
  }

  contenedor.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <div style="font-weight:600;">Avance para cierre de OC</div>
      <div style="font-weight:700; color:#185FA5;">${listas} / ${total}</div>
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
      ${!tienePO ? '<br><span style="color:#b45309">⚠️ Falta PO de DataTextNow (Contabilidad debe registrarlo para permitir cierre)</span>' : ''}
    </div>
  `;
}

async function marcarEntregado(recId) {
  const recsProyectadas = (recepcionesActuales || []).map(r =>
    r.id === recId ? { ...r, estado: 'entregado_solicitante' } : r
  );
  const evaluacion = evaluarCierreOc(ocActual, recsProyectadas);
  const esSolicitante = Auth.getUsuario()?.rol === 'solicitante';
  const mensaje = esSolicitante
    ? mensajeConfirmacionEntregaSolicitante(evaluacion)
    : mensajeConfirmacionEntregaContabilidad(evaluacion);

  if (!confirm(mensaje)) return;

  try {
    await Api.patch(`/ordenes-compra/${ocActual.id}/recepciones/${recId}/entregar`, {});
    if (evaluacion.ok) {
      Toast.success(esSolicitante
        ? 'Recepción confirmada — tu OC ha sido cerrada'
        : 'Entrega confirmada — OC cerrada automáticamente');
    } else {
      Toast.success(esSolicitante ? 'Recepción confirmada' : 'Marcado como entregado');
    }
    abrirDetalle(ocActual.id);
  } catch (err) {
    Toast.error(err.mensaje || 'Error al actualizar');
  }
}

document.getElementById('form-recepcion').addEventListener('submit', async e => {
  e.preventDefault();

  const estado = document.getElementById('rec-estado').value;
  const poNuevo = document.getElementById('rec-datatextnow').value || null;
  const esCompleta = estado !== 'recibido_parcial';

  if (esCompleta && ocActual?.estado !== 'cerrada') {
    const recsProyectadas = [
      ...(recepcionesActuales || []),
      { estado: 'recibido_completo', datatextnow_id: poNuevo },
    ];
    const evaluacion = evaluarCierreOc(ocActual, recsProyectadas, { poNuevo });
    const mensaje = mensajeConfirmacionCierreRecepcion(evaluacion);
    if (mensaje && !confirm(mensaje)) return;
  }

  try {
    const resp = await Api.post(`/ordenes-compra/${ocActual.id}/recepciones`, {
      estado,
      datatextnow_id: poNuevo,
      notas:         document.getElementById('rec-notas').value || null,
    });
    UI.cerrarModal('modal-recepcion');

    if (resp.oc_cerrada) {
      Toast.success('Recepción registrada y OC cerrada automáticamente');
    } else if (resp.pendiente_po) {
      Toast.info('Recepción registrada. Registra el PO de DataTextNow para cerrar la OC.');
    } else {
      Toast.success('Recepción registrada');
    }

    abrirDetalle(ocActual.id);
  } catch (err) {
    Toast.error(err.mensaje || 'Error al registrar recepción');
  }
});

['rec-estado', 'rec-datatextnow'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', actualizarAvisoCierreRecepcion);
  if (el && el.tagName === 'SELECT') el.addEventListener('change', actualizarAvisoCierreRecepcion);
});


