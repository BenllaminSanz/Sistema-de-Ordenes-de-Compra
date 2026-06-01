/**
 * dashboard.js
 * Lógica del Dashboard (extraída de dashboard.html)
 */

Auth.requiereAuth();
renderSidebar();
renderTopbar('Dashboard');

async function cargarMetricas() {
  const [resReq, resOC] = await Promise.all([
    Api.get('/requerimientos?limite=100'),
    Api.get('/ordenes-compra?limite=100'),
  ]);

  const reqs = resReq.datos || [];
  const ocs  = resOC.datos  || [];

  const metricas = [
    { label:'Requerimientos totales',  value: resReq.total,
      color:'blue',  icon:'📋' },
    { label:'En revisión',  value: reqs.filter(r => r.estado === 'en_revision').length,
      color:'amber', icon:'⏳' },
    { label:'OC activas',   value: ocs.filter(o => !['cerrada','cancelada'].includes(o.estado)).length,
      color:'green', icon:'📦' },
    { label:'OC cerradas',  value: ocs.filter(o => o.estado === 'cerrada').length,
      color:'red',   icon:'✔' },
  ];

  document.getElementById('metrics').innerHTML = metricas.map(m => `
    <div class="metric-card ${m.color}">
      <div class="metric-value">${m.value}</div>
      <div class="metric-label">${m.label}</div>
    </div>`).join('');
}

async function cargarOCRecientes() {
  const contenedor = document.getElementById('tabla-oc');
  const tituloOC = document.getElementById('titulo-oc');
  const tituloReq = document.getElementById('titulo-req');

  // Personalizar títulos para solicitantes
  const esSolicitante = Auth.getUsuario()?.rol === 'solicitante';
  if (esSolicitante) {
    if (tituloOC) tituloOC.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg> Mis órdenes de compra recientes`;
    if (tituloReq) tituloReq.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2"/></svg> Mis requerimientos`;
  }

  UI.spinner(contenedor);
  try {
    const { datos } = await Api.get('/ordenes-compra?limite=8');
    if (!datos.length) { UI.empty(contenedor, esSolicitante ? 'Aún no tienes órdenes de compra' : 'Sin órdenes de compra aún'); return; }
    contenedor.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Número OC</th><th>Requerimiento</th><th>Tipo</th>
            <th>Proveedor</th><th>Estado</th><th>Fecha</th><th></th>
          </tr></thead>
          <tbody>${datos.map(o => `
            <tr>
              <td class="fw-600">${o.numero_oc}</td>
              <td>${o.consecutivo}</td>
              <td>${o.tipo}</td>
              <td>${o.proveedor_nombre || '—'}</td>
              <td>${UI.badge(o.estado)}</td>
              <td class="text-muted">${UI.fecha(o.created_at)}</td>
              <td><a href="ordenes.html?id=${o.id}" class="btn btn-sm btn-outline">Ver</a></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch { UI.empty(contenedor, 'Error al cargar órdenes'); }
}

async function cargarReqPendientes() {
  const contenedor = document.getElementById('tabla-req');
  const esSolicitante = Auth.getUsuario()?.rol === 'solicitante';

  UI.spinner(contenedor);
  try {
    const { datos } = await Api.get('/requerimientos?estado=en_revision&limite=8');
    if (!datos.length) { 
      UI.empty(contenedor, esSolicitante ? 'No tienes requerimientos pendientes' : 'Sin requerimientos pendientes'); 
      return; 
    }
    contenedor.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Consecutivo</th><th>Tipo</th><th>Notas / Detalles</th>
            <th>Solicitante</th><th>Fecha</th><th></th>
          </tr></thead>
          <tbody>${datos.map(r => `
            <tr>
              <td class="fw-600">${r.consecutivo}</td>
              <td>${r.tipo}</td>
              <td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">
                ${r.notas || r.descripcion || '—'}</td>
              <td>${r.solicitante_nombre}</td>
              <td class="text-muted">${UI.fecha(r.created_at)}</td>
              <td><a href="requerimientos.html?id=${r.id}" class="btn btn-sm btn-outline">Ver</a></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch { UI.empty(contenedor, 'Error al cargar requerimientos'); }
}

cargarMetricas();
cargarOCRecientes();
cargarReqPendientes();

// ==============================================
// Reporte de Órdenes de Compra (Fase 1)
// Solo visible para contabilidad y admin
// ==============================================
function inicializarReporteOrdenes() {
  const user = Auth.getUsuario();
  const puedeGenerar = user && ['contabilidad', 'admin'].includes(user.rol);

  const card = document.getElementById('reporte-card');
  if (!card) return;

  if (!puedeGenerar) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';

  const tipoSelect = document.getElementById('rep-tipo');
  const anioInput = document.getElementById('rep-anio');
  const mesContainer = document.getElementById('rep-mes-container');
  const semanaContainer = document.getElementById('rep-semana-container');
  const btn = document.getElementById('btn-generar-reporte');

  function actualizarCampos() {
    const tipo = tipoSelect.value;
    mesContainer.style.display = (tipo === 'mensual') ? 'block' : 'none';
    semanaContainer.style.display = (tipo === 'semanal') ? 'block' : 'none';
  }

  tipoSelect.addEventListener('change', actualizarCampos);
  actualizarCampos();

  btn.addEventListener('click', async () => {
    const tipo = tipoSelect.value;
    const anio = anioInput.value || new Date().getFullYear();
    let url = `/api/reportes/ordenes-compra?tipo=${tipo}&anio=${anio}`;

    if (tipo === 'mensual') {
      const mes = document.getElementById('rep-mes').value;
      url += `&mes=${mes}`;
    } else if (tipo === 'semanal') {
      const semana = document.getElementById('rep-semana').value;
      url += `&semana=${semana}`;
    }

    btn.disabled = true;
    btn.textContent = 'Generando...';

    try {
      const token = Auth.getToken();
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.mensaje || 'Error al generar el reporte');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;

      // Nombre sugerido
      const filename = response.headers.get('Content-Disposition')?.split('filename=')[1] || `Reporte_Ordenes_Compra_${tipo}_${anio}.xlsx`;
      a.download = filename.replace(/"/g, '');
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      alert(e.message || 'Error al descargar el reporte');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Descargar Excel';
    }
  });
}

inicializarReporteOrdenes();
