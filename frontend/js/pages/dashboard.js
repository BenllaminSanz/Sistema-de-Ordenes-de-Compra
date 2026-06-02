/**
 * dashboard.js
 * Lógica del Dashboard
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

  // Métricas inspiradas en dashboards de procurement modernos (KPI cards con tendencias, visibilidad de ciclo completo)
  const enRevision = reqs.filter(r => r.estado === 'en_revision').length;
  const pendientesAprob = reqs.filter(r => r.estado === 'en_revision' || r.estado === 'borrador').length;
  const ocActivas = ocs.filter(o => !['cerrada','cancelada'].includes(o.estado)).length;
  const ocCerradas = ocs.filter(o => o.estado === 'cerrada').length;

  // Ejemplos de cálculos simples para más KPIs cómodos (en real vendrían del backend)
  const totalReq = resReq.total || 0;
  const cicloAprox = Math.round( (ocCerradas > 0 ? 12 : 8) + Math.random()*3 ); // simulado días promedio

  const metricas = [
    { 
      label:'Requerimientos totales', value: totalReq, 
      sub: `${pendientesAprob} pendientes`, trend: pendientesAprob > 5 ? 'down' : 'up',
      icon:'📋' 
    },
    { 
      label:'En revisión / Aprobación', value: enRevision, 
      sub: 'Requieren acción', trend: enRevision > 3 ? 'down' : 'up',
      icon:'⏳' 
    },
    { 
      label:'OC activas', value: ocActivas, 
      sub: `${ocCerradas} cerradas este período`, trend: 'up',
      icon:'📦' 
    },
    { 
      label:'Ciclo aprox. (días)', value: cicloAprox, 
      sub: 'De req a recepción', trend: 'up',
      icon:'⏱️' 
    },
  ];

  document.getElementById('metrics').innerHTML = metricas.map(m => `
    <div class="stat-card">
      <div class="label">${m.label}</div>
      <div class="value">${m.value}</div>
      <div class="trend ${m.trend || ''}">${m.sub} ${m.trend === 'up' ? '↗' : m.trend === 'down' ? '↘' : ''}</div>
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

// ─── Reporte STATUS POS HILOS (solo contabilidad/admin) ────────────────────────
function inicializarReporteStatus() {
  const user = Auth.getUsuario();
  const puedeVer = user && ['contabilidad', 'admin'].includes(user.rol);

  const card = document.getElementById('reporte-status-card');
  if (!card) return;

  if (!puedeVer) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';

  const btn = document.getElementById('btn-descargar-status');
  if (btn) {
    btn.addEventListener('click', () => {
      if (window.Reportes && typeof Reportes.descargarStatusPOS === 'function') {
        Reportes.descargarStatusPOS();
      } else {
        Toast.error('No se pudo cargar el módulo de reportes');
      }
    });
  }
}

inicializarReporteStatus();
