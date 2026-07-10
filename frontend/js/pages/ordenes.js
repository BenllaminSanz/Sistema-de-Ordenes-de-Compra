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

function calcularEstadoRecepcion() {
  let algunoParcial = false;
  document.querySelectorAll('#rec-items-list .rec-item-row').forEach(row => {
    const chk = row.querySelector('.rec-item-check');
    if (!chk?.checked) return;
    const cantidad  = parseFloat(row.querySelector('.rec-item-cantidad')?.value || 0);
    const pendiente = parseFloat(row.dataset.pendiente || 0);
    if (cantidad < pendiente) algunoParcial = true;
  });
  return algunoParcial ? 'recibido_parcial' : 'recibido_completo';
}

function recalcEstadoAuto() {
  const el = document.getElementById('rec-estado-auto');
  if (!el) return;

  let algunoMarcado = false;
  let algunoParcial = false;
  document.querySelectorAll('#rec-items-list .rec-item-row').forEach(row => {
    const chk = row.querySelector('.rec-item-check');
    if (!chk?.checked) return;
    algunoMarcado = true;
    const cantidad  = parseFloat(row.querySelector('.rec-item-cantidad')?.value || 0);
    const pendiente = parseFloat(row.dataset.pendiente || 0);
    if (cantidad < pendiente) algunoParcial = true;
  });

  if (!algunoMarcado) { el.innerHTML = ''; return; }

  if (algunoParcial) {
    el.innerHTML = '<span style="color:#854d0e;font-weight:600">⚠ Entrega parcial</span> — algunos ítems quedan pendientes de recibir.';
  } else {
    el.innerHTML = '<span style="color:#166534;font-weight:600">✓ Entrega completa</span> — todos los ítems pendientes quedarán cubiertos.';
  }
  actualizarAvisoCierreRecepcion();
}

function actualizarAvisoCierreRecepcion() {
  const aviso = document.getElementById('rec-aviso-cierre');
  if (!aviso || !ocActual) return;

  if (ocActual.estado === 'cerrada') { aviso.style.display = 'none'; return; }

  const estado  = calcularEstadoRecepcion();
  const poNuevo = ocActual?.datatextnow_id || null;

  if (estado === 'recibido_parcial') { aviso.style.display = 'none'; return; }

  const recsProyectadas = [
    ...(recepcionesActuales || []),
    { estado: 'recibido_completo', datatextnow_id: poNuevo },
  ];
  const evaluacion = evaluarCierreOc(ocActual, recsProyectadas, { poNuevo });

  if (evaluacion.ok) {
    aviso.style.display = 'block';
    aviso.innerHTML = '<strong>Atención:</strong> Esta entrega completa '
      + 'cerrará la Orden de Compra <strong>automáticamente</strong>.';
    return;
  }

  if (evaluacion.motivo === 'sin_po') {
    aviso.style.display = 'block';
    aviso.innerHTML = 'La entrega se registrará, pero la OC <strong>no se cerrará</strong> '
      + 'hasta registrar el PO de DataTextNow (en este formulario o en la OC).';
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
              <td>${o.monto_total != null
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
          <td>${oc.monto_total != null
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

    ${oc.items && oc.items.length > 0 ? (() => {
      const esCatalogo  = !oc.cotizacion_id;
      const puedeEditar = esCatalogo && Auth.puedeHacer(['contabilidad', 'admin']);
      const moneda      = oc.moneda || 'MXN';
      const labelTotal = 'Total';
      const nota = oc.cotizacion_id
        ? 'Precios según la cotización elegida. Total calculado de líneas.'
        : 'Precios de referencia del catálogo (el precio real puede variar).';
      const tituloItems = oc.cotizacion_id
        ? 'Ítems / Líneas de la OC (según cotización seleccionada)'
        : 'Ítems / Líneas de la OC (según requerimiento — sin cotización)';

      // Cotización: Código | Descripción | Cantidad | Precio unit. | Subtotal
      if (!esCatalogo) {
        let totalGeneral = 0;
        let tieneSubtotales = false;

        const filasCot = oc.items.map(it => {
          const codigo = (it.codigo || it.codigo_catalogo || '').trim();
          const cantidad = parseFloat(it.cantidad || 0) || 0;
          const precio = it.precio_unitario != null ? parseFloat(it.precio_unitario) : null;
          const precioFmt = precio != null
            ? precio.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : '—';

          let subtotalFmt = '—';
          if (precio != null) {
            const sub = Math.round(cantidad * precio * 100) / 100;
            totalGeneral = Math.round((totalGeneral + sub) * 100) / 100;
            tieneSubtotales = true;
            subtotalFmt = sub.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          }

          const prov = (it.proveedor_num || it.proveedor_nombre)
            ? `<div style="font-size:10px; color:#64748b; margin-top:1px;">Prov: <strong>${UI.esc(it.proveedor_num || '')}${it.proveedor_nombre ? ' — ' + UI.esc(it.proveedor_nombre) : ''}</strong></div>`
            : '';

          return `
            <tr>
              <td style="padding:4px 6px; border-bottom:1px solid #eee;"><strong>${UI.esc(codigo || '—')}</strong>${prov}</td>
              <td style="padding:4px 6px; border-bottom:1px solid #eee;">${UI.esc(it.descripcion || '—')}</td>
              <td style="padding:4px 6px; border-bottom:1px solid #eee; text-align:right;">${cantidad.toLocaleString('es-MX')}${it.unidad ? ` <span style="color:#94a3b8;font-size:11px;">${UI.esc(it.unidad)}</span>` : ''}</td>
              <td style="padding:4px 6px; border-bottom:1px solid #eee; text-align:right; color:#0d6efd; font-weight:500;">${precio != null ? `${precioFmt} ${moneda}` : '—'}</td>
              <td style="padding:4px 6px; border-bottom:1px solid #eee; text-align:right; font-weight:600;">${subtotalFmt !== '—' ? `$${subtotalFmt} ${moneda}` : '—'}</td>
            </tr>`;
        }).join('');

        const totalFmt = tieneSubtotales
          ? totalGeneral.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : null;

        return `
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid #f0f0f0">
          <div style="font-size:12px;color:#6b7280;margin-bottom:6px">${tituloItems}</div>
          <table style="width:100%; font-size:13px; border-collapse: collapse;">
            <thead>
              <tr style="background:#f8f9fa;">
                <th style="text-align:left; padding:4px 6px;">Código</th>
                <th style="text-align:left; padding:4px 6px;">Descripción</th>
                <th style="text-align:right; padding:4px 6px;">Cantidad</th>
                <th style="text-align:right; padding:4px 6px;">Precio unit.</th>
                <th style="text-align:right; padding:4px 6px;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${filasCot}
              ${totalFmt ? `
              <tr style="background:#f8fafc;">
                <td colspan="4" style="padding:8px 6px; text-align:right; font-weight:700; border-top:2px solid #e2e8f0;">${labelTotal}</td>
                <td style="padding:8px 6px; text-align:right; font-weight:700; color:#166534; font-size:14px; border-top:2px solid #e2e8f0;">$${totalFmt} ${moneda}</td>
              </tr>` : ''}
            </tbody>
          </table>
          <div style="font-size:11px;color:#64748b;margin-top:4px;">${nota}</div>
        </div>`;
      }

      // Catálogo directo (sin cotización)
      let totalGeneral = 0;
      let tieneSubtotales = false;
      const trailingCols = puedeEditar ? 1 : 0;

      const filas = oc.items.map(it => {
        const codigo = (it.codigo || '').trim();
        const cantidad = parseFloat(it.cantidad || 0) || 0;
        const precio = it.precio_unitario != null
          ? parseFloat(it.precio_unitario)
          : (it.precio_unitario_referencia != null ? parseFloat(it.precio_unitario_referencia) : null);
        const esRef = it.precio_unitario == null && it.precio_unitario_referencia != null;
        const precioFmt = precio != null
          ? precio.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : '—';

        let subtotalFmt = '—';
        if (precio != null) {
          const sub = Math.round(cantidad * precio * 100) / 100;
          totalGeneral = Math.round((totalGeneral + sub) * 100) / 100;
          tieneSubtotales = true;
          subtotalFmt = sub.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        const prov = (it.proveedor_num || it.proveedor_nombre)
          ? `<div style="font-size:10px; color:#64748b; margin-top:1px;">Prov: <strong>${UI.esc(it.proveedor_num || '')}${it.proveedor_nombre ? ' — ' + UI.esc(it.proveedor_nombre) : ''}</strong></div>`
          : '';

        const safeDesc  = (it.descripcion || it.codigo || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeUnd   = (it.unidad || '').replace(/'/g, "\\'");
        const precioVal = it.precio_unitario_referencia != null ? it.precio_unitario_referencia : 'null';
        const editBtn   = puedeEditar
          ? `<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">${
              it.catalogo_id
                ? `<button onclick="abrirEditarItemProveedor(${it.catalogo_id},'${safeDesc}',${it.proveedor_id || 'null'},${precioVal},'${safeUnd}')"
                     class="btn btn-sm btn-outline" title="Editar ítem" style="padding:1px 5px;">✎</button>`
                : ''
            }</td>`
          : '';

        return `
          <tr>
            <td style="padding:4px 6px; border-bottom:1px solid #eee;"><strong>${UI.esc(codigo || '—')}</strong>${prov}</td>
            <td style="padding:4px 6px; border-bottom:1px solid #eee;">${UI.esc(it.descripcion || '—')}</td>
            <td style="padding:4px 6px; border-bottom:1px solid #eee; text-align:right;">${cantidad.toLocaleString('es-MX')}${it.unidad ? ` <span style="color:#94a3b8;font-size:11px;">${UI.esc(it.unidad)}</span>` : ''}</td>
            <td style="padding:4px 6px; border-bottom:1px solid #eee; text-align:right; color:#0d6efd; font-weight:500;">${precio != null ? `${precioFmt} ${moneda}${esRef ? ' <span style="color:#94a3b8;font-weight:400">(ref)</span>' : ''}` : '—'}</td>
            <td style="padding:4px 6px; border-bottom:1px solid #eee; text-align:right; font-weight:600;">${subtotalFmt !== '—' ? `$${subtotalFmt} ${moneda}` : '—'}</td>
            ${editBtn}
          </tr>`;
      }).join('');

      const totalFmt = tieneSubtotales
        ? totalGeneral.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : null;

      return `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid #f0f0f0">
        <div style="font-size:12px;color:#6b7280;margin-bottom:6px">${tituloItems}</div>
        <table style="width:100%; font-size:13px; border-collapse: collapse;">
          <thead>
            <tr style="background:#f8f9fa;">
              <th style="text-align:left; padding:4px 6px;">Código</th>
              <th style="text-align:left; padding:4px 6px;">Descripción</th>
              <th style="text-align:right; padding:4px 6px;">Cantidad</th>
              <th style="text-align:right; padding:4px 6px;">Precio ref.</th>
              <th style="text-align:right; padding:4px 6px;">Subtotal</th>
              ${puedeEditar ? '<th style="width:32px;"></th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${filas}
            ${totalFmt ? `
            <tr style="background:#f8fafc;">
              <td colspan="4" style="padding:8px 6px; text-align:right; font-weight:700; border-top:2px solid #e2e8f0;">${labelTotal}</td>
              <td style="padding:8px 6px; text-align:right; font-weight:700; color:#166534; font-size:14px; border-top:2px solid #e2e8f0;">$${totalFmt} ${moneda}</td>
              ${trailingCols ? '<td style="border-top:2px solid #e2e8f0;"></td>' : ''}
            </tr>` : ''}
          </tbody>
        </table>
        <div style="font-size:11px;color:#64748b;margin-top:4px;">${nota}</div>
      </div>`;
    })() : '' }`;

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
    generada:    [{ label:'Distribuir',         estado:'distribuida', clase:'btn-primary' }],
    distribuida: [{ label:'Registrar entrega',  accion:'abrirRecepcion', clase:'btn-success' },
                  { label:'Cancelar OC',        estado:'cancelada',   clase:'btn-danger'  }],
    en_proceso:  [{ label:'Registrar entrega',  accion:'abrirRecepcion', clase:'btn-success' },
                  { label:'Cerrar OC',          estado:'cerrada',     clase:'btn-primary' },
                  { label:'Cancelar OC',        estado:'cancelada',   clase:'btn-danger'  }],
    recibida:    [{ label:'Cerrar OC',          estado:'cerrada',     clase:'btn-success' }],
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

function ocBloqueaRecepciones(oc = ocActual) {
  return oc && ['cerrada', 'cancelada'].includes(oc.estado);
}

async function cargarResumenItemsOc(ocId, excluirRecepcionId = null) {
  try {
    const qs = excluirRecepcionId ? `?excluir_recepcion_id=${excluirRecepcionId}` : '';
    resumenItemsOc = await Api.get(`/ordenes-compra/${ocId}/recepciones/resumen-items${qs}`);
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
          <th style="padding:6px 8px; text-align:center; width:32px;">✓</th>
          <th style="padding:6px 8px; text-align:left;">Ítem</th>
          <th style="padding:6px 8px; text-align:right; white-space:nowrap;">Solicit.</th>
          <th style="padding:6px 8px; text-align:right; white-space:nowrap;">Ya recib.</th>
          <th style="padding:6px 8px; text-align:right; white-space:nowrap; color:#854d0e;">Pendiente</th>
          <th style="padding:6px 8px; text-align:right; width:96px; white-space:nowrap;">Esta entrega</th>
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
          const pendColor = pendiente > 0 ? 'color:#854d0e;font-weight:600' : 'color:#22c55e;font-weight:600';
          return `
            <tr class="rec-item-row" data-item-key="${it.item_key}" data-pendiente="${pendiente}" style="border-top:1px solid #e5e7eb;">
              <td style="padding:6px 8px; text-align:center;">
                <input type="checkbox" class="rec-item-check" ${checked ? 'checked' : ''}>
              </td>
              <td style="padding:6px 8px;">${desc}<div class="text-muted" style="font-size:10px;">${it.unidad || 'pieza'}</div></td>
              <td style="padding:6px 8px; text-align:right; font-variant-numeric:tabular-nums;">${parseFloat(it.cantidad_solicitada || 0).toLocaleString('es-MX')}</td>
              <td style="padding:6px 8px; text-align:right; font-variant-numeric:tabular-nums; color:#6b7280;">${parseFloat(it.cantidad_recibida || 0).toLocaleString('es-MX')}</td>
              <td style="padding:6px 8px; text-align:right; font-variant-numeric:tabular-nums; ${pendColor}">${pendiente.toLocaleString('es-MX')}</td>
              <td style="padding:6px 8px; text-align:right;">
                <input type="number" class="form-control form-control-sm rec-item-cantidad"
                       min="0" step="0.01" value="${prefill > 0 ? prefill : ''}"
                       placeholder="0" style="width:84px; text-align:right;"
                       oninput="recalcEstadoAuto()">
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
          const pend = parseFloat(row.dataset.pendiente || 0);
          input.value = pend > 0 ? pend : '';
        }
      }
      recalcEstadoAuto();
    });
    chk.dispatchEvent(new Event('change'));
  });
  recalcEstadoAuto();
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
  if (ocBloqueaRecepciones()) {
    return Toast.error('La OC está cerrada o cancelada. No se pueden registrar ni modificar recepciones.');
  }

  recepcionEditandoId = recepcion?.id || null;
  document.getElementById('rec-id').value = recepcionEditandoId || '';
  document.getElementById('form-recepcion').reset();

  const titulo = document.getElementById('modal-recepcion-titulo');
  const btn = document.getElementById('btn-guardar-recepcion');
  if (titulo) titulo.textContent = recepcionEditandoId ? 'Editar recepción' : 'Registrar recepción';
  if (btn) btn.textContent = recepcionEditandoId ? 'Guardar cambios' : 'Confirmar recepción';

  if (recepcion) {
    document.getElementById('rec-notas').value = recepcion.notas || '';
  }

  const loading = document.getElementById('rec-items-loading');
  if (loading) loading.style.display = 'block';
  document.getElementById('rec-items-list').innerHTML = '';

  await cargarResumenItemsOc(ocActual.id, recepcionEditandoId || null);
  if (loading) loading.style.display = 'none';
  renderLineasRecepcionModal(resumenItemsOc, recepcion?.items || []);

  actualizarAvisoCierreRecepcion();
  UI.abrirModal('modal-recepcion');
}

async function editarRecepcion(recId) {
  if (!Auth.puedeHacer(['contabilidad', 'admin'])) return;
  if (ocBloqueaRecepciones()) {
    return Toast.error('La OC está cerrada o cancelada. No se pueden modificar recepciones.');
  }
  const recepcion = (recepcionesActuales || []).find(r => r.id === recId);
  if (!recepcion) return Toast.error('Recepción no encontrada');
  await abrirRecepcion(recepcion);
}

async function eliminarRecepcion(recId) {
  if (!Auth.puedeHacer(['contabilidad', 'admin'])) return;
  if (ocBloqueaRecepciones()) {
    return Toast.error('La OC está cerrada o cancelada. No se pueden eliminar recepciones.');
  }
  if (!confirm('¿Eliminar esta recepción?\nSe actualizarán los avances de ítems recibidos.')) return;

  try {
    await Api.delete(`/ordenes-compra/${ocActual.id}/recepciones/${recId}`);
    Toast.success('Recepción eliminada');
    abrirDetalle(ocActual.id);
  } catch (err) {
    Toast.error(err.mensaje || 'Error al eliminar recepción');
  }
}

function poDataTextNowActual(oc = ocActual, recepciones = recepcionesActuales) {
  const po = resolverPoOrden(oc, recepciones);
  if (!po || po.toUpperCase() === 'N/A') return '';
  return po;
}

async function abrirModalCierreOc({ anticipado = false } = {}) {
  if (!ocActual) return;

  const recs = recepcionesActuales || [];
  if (!recs.length) {
    return Toast.error('Registra al menos una recepción antes de cerrar la OC');
  }

  const titulo = document.querySelector('#modal-cierre-anticipado .modal-title');
  if (titulo) {
    titulo.textContent = anticipado
      ? 'Cerrar OC con ítems incompletos'
      : 'Cerrar orden de compra';
  }

  const contPendientes = document.getElementById('cierre-anticipado-pendientes');
  if (contPendientes) {
    if (anticipado) {
      const pendientes = (resumenItemsOc || []).filter(it => (parseFloat(it.pendiente) || 0) > 0);
      const pendientesHtml = pendientes.map(it => {
        const desc = it.codigo ? `<strong>${it.codigo}</strong> — ${it.descripcion}` : it.descripcion;
        return `<div style="padding:3px 0;font-size:13px;">
          ${desc}: <span style="color:#854d0e;font-weight:600">${parseFloat(it.pendiente).toLocaleString('es-MX')} ${it.unidad || ''} pendiente(s)</span>
        </div>`;
      }).join('');
      contPendientes.innerHTML = `
        <div style="background:#fff7ed;border:1px solid #fde68a;border-radius:6px;padding:12px;margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:6px;">Ítems con entrega incompleta:</div>
          ${pendientesHtml}
        </div>`;
    } else {
      contPendientes.innerHTML = `
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px;margin-bottom:16px;font-size:13px;color:#1e40af;">
          Ingresa el <strong>PO de DataTextNow</strong> para poder cerrar la orden de compra.
        </div>`;
    }
  }

  const poInput = document.getElementById('cierre-po');
  if (poInput) {
    poInput.value = poDataTextNowActual() || '';
    setTimeout(() => poInput.focus(), 150);
  }
  document.getElementById('cierre-notas').value = '';

  const btnConfirm = document.getElementById('btn-confirmar-cierre-anticipado');
  if (btnConfirm) {
    btnConfirm.textContent = anticipado ? 'Cerrar OC de todas formas' : 'Cerrar OC';
  }

  UI.abrirModal('modal-cierre-anticipado');

  document.getElementById('btn-confirmar-cierre-anticipado').onclick = async () => {
    const po = document.getElementById('cierre-po').value.trim();
    if (!po) return Toast.error('El PO de DataTextNow es requerido para cerrar la OC');
    const notas = document.getElementById('cierre-notas').value.trim() || null;

    try {
      const poGuardado = poDataTextNowActual();
      if (po !== poGuardado) {
        await Api.patch(`/ordenes-compra/${ocActual.id}/datatextnow`, { datatextnow_id: po });
      }
      await Api.patch(`/ordenes-compra/${ocActual.id}/estado`, { estado: 'cerrada', notas });
      UI.cerrarModal('modal-cierre-anticipado');
      Toast.success('OC cerrada');
      abrirDetalle(ocActual.id);
    } catch (err) {
      Toast.error(err.mensaje || 'Error al cerrar la OC');
    }
  };
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

  if (estado === 'cerrada') {
    const hayPendientes = (resumenItemsOc || []).some(it => (parseFloat(it.pendiente) || 0) > 0);
    abrirModalCierreOc({
      anticipado: hayPendientes && ocActual?.estado === 'en_proceso',
    });
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

        const puedeEditarRec = esContab && !ocBloqueaRecepciones(ocActual);
        const accionesContab = puedeEditarRec ? `
          <div class="d-flex gap-1 mt-2">
            <button class="btn btn-sm btn-outline" data-action="editar-recepcion" data-rec-id="${r.id}">Editar</button>
            <button class="btn btn-sm btn-danger" data-action="eliminar-recepcion" data-rec-id="${r.id}">Eliminar</button>
          </div>` : (esContab && ocBloqueaRecepciones(ocActual)
            ? '<div class="text-muted text-sm mt-2">OC cerrada — recepciones bloqueadas</div>'
            : '');

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

  const closeBtn = document.querySelector('#panel-acciones button[data-estado="cerrada"]');
  if (closeBtn && ocActual && ['en_proceso', 'recibida'].includes(ocActual.estado)) {
    closeBtn.disabled = false;
    const tienePO = !!poDataTextNowActual(ocActual, recs);
    if (!recs.length) {
      closeBtn.title = 'Registra al menos una recepción antes de cerrar';
    } else if (!tienePO) {
      closeBtn.title = 'Clic para ingresar el PO de DataTextNow y cerrar';
    } else {
      closeBtn.title = 'Cerrar la OC';
    }
  }
}

// ── Resumen de Avance para Cierre de OC ───────────────────────
function renderResumenAvance(recepciones) {
  const contenedor = document.getElementById('resumen-avance-oc');
  if (!contenedor || !ocActual) return;

  const items = resumenItemsOc || [];

  if (!items.length) {
    contenedor.style.display = 'none';
    return;
  }
  contenedor.style.display = '';

  const tienePO = !!(ocActual.datatextnow_id && String(ocActual.datatextnow_id).trim())
    || recepciones.some(r => r.datatextnow_id && String(r.datatextnow_id).trim());

  const completados = items.filter(it => (parseFloat(it.pendiente) || 0) <= 0).length;
  const pctGlobal   = Math.round((completados / items.length) * 100);

  const barrasHtml = items.map(it => {
    const sol  = parseFloat(it.cantidad_solicitada) || 0;
    const rec  = parseFloat(it.cantidad_recibida)   || 0;
    const pend = parseFloat(it.pendiente)            || 0;
    const pct  = sol > 0 ? Math.min(100, Math.round((rec / sol) * 100)) : 0;
    const done = pend <= 0;
    const barColor = done ? '#22c55e' : (rec > 0 ? '#fbbf24' : '#e2e8f0');
    const textColor = done ? '#166534' : (rec > 0 ? '#854d0e' : '#94a3b8');
    const label = done ? '✓ Completo' : (rec > 0 ? `${pct}%` : '—');
    const desc  = it.codigo ? `<strong>${it.codigo}</strong> — ${it.descripcion}` : it.descripcion;

    return `
      <div style="margin-bottom:9px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;">
          <span style="font-size:12px;font-weight:500;">${desc}</span>
          <span style="font-size:11.5px;font-variant-numeric:tabular-nums;color:${textColor};font-weight:600;white-space:nowrap;margin-left:8px;">
            ${rec.toLocaleString('es-MX')} / ${sol.toLocaleString('es-MX')} ${it.unidad || ''} · ${label}
          </span>
        </div>
        <div style="height:5px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${barColor};border-radius:3px;transition:width .35s;"></div>
        </div>
      </div>`;
  }).join('');

  let aviso = '';
  if (ocActual.estado !== 'cerrada') {
    if (completados === items.length && !tienePO) {
      aviso = '<div style="margin-top:6px;font-size:12px;color:#854d0e;">⚠ Todos los ítems recibidos — falta el PO de DataTextNow para cerrar.</div>';
    } else if (!tienePO) {
      aviso = '<div style="margin-top:6px;font-size:12px;color:#64748b;">⚠ Falta PO de DataTextNow para permitir el cierre.</div>';
    }
  }

  contenedor.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;color:#64748b;">Avance por ítem</div>
      <div style="font-size:13px;font-weight:700;color:#185FA5;">${pctGlobal}%</div>
    </div>
    ${barrasHtml}
    ${aviso}`;
}

document.getElementById('form-recepcion').addEventListener('submit', async e => {
  e.preventDefault();

  const estado = calcularEstadoRecepcion();
  const poNuevo = null;
  const notas = document.getElementById('rec-notas').value || null;
  const items = recolectarItemsRecepcionFormulario();
  const esCompleta = estado !== 'recibido_parcial';
  const editId = recepcionEditandoId || parseInt(document.getElementById('rec-id')?.value, 10) || null;

  if (!items.length) {
    return Toast.error('Selecciona al menos un ítem con cantidad recibida mayor a 0');
  }

  for (const row of document.querySelectorAll('#rec-items-list .rec-item-row')) {
    const chk = row.querySelector('.rec-item-check');
    if (!chk?.checked) continue;
    const cantidad = parseFloat(row.querySelector('.rec-item-cantidad')?.value || 0);
    const pendiente = parseFloat(row.dataset.pendiente || 0);
    if (cantidad > pendiente + 0.0001) {
      return Toast.error(
        `La cantidad ingresada (${cantidad}) supera el pendiente actual (${pendiente}) en uno de los ítems.`
      );
    }
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


const busqOcInput = document.getElementById('fil-busqueda-oc');
if (busqOcInput) {
  busqOcInput.addEventListener('input', window.debounce(() => cargarOrdenes(1), 300));
}

let _editItemCatalogoId = null;
let _editItemProveedorInited = false;

async function initProveedorBusquedaEditarItemOc() {
  if (_editItemProveedorInited || typeof ProveedorBusqueda === 'undefined') return;
  await ProveedorBusqueda.init({
    inputId: 'editar-item-proveedor-busqueda',
    hiddenId: 'editar-item-proveedor-id',
    datalistId: 'editar-item-proveedores-list',
    placeholder: 'Buscar por código o nombre…',
  });
  _editItemProveedorInited = true;
}

async function abrirEditarItemProveedor(catalogoId, descripcion, proveedorActualId, precioActual, unidadActual) {
  _editItemCatalogoId = catalogoId;

  const descEl = document.getElementById('editar-item-desc');
  if (descEl) descEl.textContent = descripcion;

  const precioEl  = document.getElementById('editar-item-precio');
  const unidadEl  = document.getElementById('editar-item-unidad');
  if (precioEl)  precioEl.value  = precioActual != null ? precioActual : '';
  if (unidadEl)  unidadEl.value  = unidadActual || '';

  const provInput  = document.getElementById('editar-item-proveedor-busqueda');
  const provHidden = document.getElementById('editar-item-proveedor-id');
  if (!provInput) return;

  try {
    await initProveedorBusquedaEditarItemOc();
    ProveedorBusqueda.establecer(provInput, provHidden, proveedorActualId || '');
  } catch {
    Toast.error('No se pudieron cargar los proveedores');
    return;
  }

  document.getElementById('btn-guardar-item-proveedor').onclick = async () => {
    ProveedorBusqueda.resolver(provInput, provHidden);
    const provId = provHidden?.value ? parseInt(provHidden.value, 10) : null;
    const precio = precioEl?.value !== '' && precioEl?.value != null ? parseFloat(precioEl.value) : null;
    const unidad = unidadEl?.value.trim() || null;
    try {
      await Api.patch(`/ordenes-compra/${ocActual.id}/items/${_editItemCatalogoId}`, {
        proveedor_id: provId,
        costo_referencia: precio,
        unidad,
      });
      UI.cerrarModal('modal-editar-item-proveedor');
      Toast.success('Ítem actualizado');
      abrirDetalle(ocActual.id);
    } catch (err) {
      Toast.error(err.mensaje || 'Error al actualizar ítem');
    }
  };

  UI.abrirModal('modal-editar-item-proveedor');
}

window.abrirRecepcion = abrirRecepcion;
window.cerrarModalRecepcion = cerrarModalRecepcion;
window.editarRecepcion = editarRecepcion;
window.eliminarRecepcion = eliminarRecepcion;
window.abrirEditarItemProveedor = abrirEditarItemProveedor;


