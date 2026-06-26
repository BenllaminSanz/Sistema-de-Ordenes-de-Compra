/**
 * dashboard.js — KPIs reales + layout 2 columnas
 */

Auth.requiereAuth();
renderSidebar();
renderTopbar('Dashboard');

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const HOY   = new Date();
let anioActual = HOY.getFullYear();

// ─── Selector de año ──────────────────────────────────────────
(function initAnioSelect() {
  const sel = document.getElementById('dash-anio');
  if (!sel) return;
  for (let y = anioActual; y >= anioActual - 4; y--) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    if (y === anioActual) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => {
    anioActual = parseInt(sel.value);
    document.getElementById('dash-titulo').textContent = `Dashboard ${anioActual}`;
    cargarDashboard();
  });
  document.getElementById('dash-titulo').textContent = `Dashboard ${anioActual}`;
})();

// ─── Helpers ──────────────────────────────────────────────────
function fmt(n, moneda = 'MXN') {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: moneda, maximumFractionDigits: 0
  }).format(n);
}
function pct(parte, total) { return total ? Math.round((parte / total) * 100) : 0; }

function distBar(valor, max, color) {
  const w = max ? Math.round((valor / max) * 100) : 0;
  return `<div class="dist-bar-bg"><div class="dist-bar-fill" style="width:${w}%;background:${color}"></div></div>`;
}

function badgeDias(d) {
  if (d >= 15) return `<span class="badge-dias-crit">${d}d</span>`;
  if (d >= 7)  return `<span class="badge-dias-warn">${d}d</span>`;
  return `<span class="badge-dias-ok">${d}d</span>`;
}

function sparkline(datos) {
  const vals = Array(12).fill(0);
  datos.forEach(d => { vals[d.mes - 1] = Number(d.total_mxn) || 0; });
  const max = Math.max(...vals, 1);
  const W = 100, H = 28, step = W / 11;
  const pts = vals.map((v, i) =>
    `${+(i * step).toFixed(1)},${+(H - (v / max) * H).toFixed(1)}`
  ).join(' ');
  return `<div class="sparkline-wrap">
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      <polyline points="${pts}" fill="none" stroke="currentColor"
                stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
  </div>`;
}

// ─── KPI Cards ────────────────────────────────────────────────
function renderKPIs(s) {
  const reqMap = {}, ocMap = {};
  s.estados_req.forEach(r => { reqMap[r.estado] = +r.total; });
  s.estados_oc.forEach(o => { ocMap[o.estado]  = +o.total; });

  const totalReqs  = Object.values(reqMap).reduce((a, b) => a + b, 0);
  const enRevision = reqMap['en_revision'] || 0;
  const rechazados = reqMap['rechazado']   || 0;
  const ocEnVuelo  = (ocMap['generada'] || 0) + (ocMap['distribuida'] || 0)
    + (ocMap['en_proceso'] || 0) + (ocMap['recibida'] || 0);
  const ocCerradas = ocMap['cerrada'] || 0;
  const totalOC    = Object.values(ocMap).reduce((a, b) => a + b, 0);
  const ciclo      = s.ciclo?.dias_promedio;

  const gastoMXN = s.gasto_por_tipo.filter(g => g.moneda === 'MXN').reduce((a, g) => a + +g.total, 0);
  const gastoUSD = s.gasto_por_tipo.filter(g => g.moneda === 'USD').reduce((a, g) => a + +g.total, 0);

  const cards = [
    {
      label: `Requerimientos ${s.anio}`,
      value: totalReqs.toLocaleString('es-MX'),
      sub: `${enRevision} en revisión · ${rechazados} rechazados`,
      color: '#185FA5', bg: '#e6f1fb',
      icon: `<svg width="16" height="16" fill="none" stroke="#185FA5" stroke-width="2" viewBox="0 0 24 24">
               <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2"/>
             </svg>`,
      extra: sparkline(s.volumen_mensual),
    },
    {
      label: `Gasto MXN ${s.anio}`,
      value: fmt(gastoMXN, 'MXN'),
      sub: gastoUSD ? `+ ${fmt(gastoUSD, 'USD')} USD` : 'Sin gasto en USD registrado',
      color: '#0f766e', bg: '#d1fae5',
      icon: `<svg width="16" height="16" fill="none" stroke="#0f766e" stroke-width="2" viewBox="0 0 24 24">
               <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
             </svg>`,
    },
    {
      label: 'OC en proceso',
      value: ocEnVuelo.toLocaleString('es-MX'),
      sub: `${ocCerradas} cerradas · ${totalOC} total histórico`,
      color: '#7c3aed', bg: '#ede9fe',
      icon: `<svg width="16" height="16" fill="none" stroke="#7c3aed" stroke-width="2" viewBox="0 0 24 24">
               <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
             </svg>`,
    },
    {
      label: 'Ciclo promedio',
      value: ciclo != null ? `${ciclo}d` : '—',
      sub: ciclo != null
        ? `Mín ${s.ciclo.dias_min}d · Máx ${s.ciclo.dias_max}d (req → OC)`
        : 'Sin datos suficientes',
      color: '#b45309', bg: '#fef3c7',
      icon: `<svg width="16" height="16" fill="none" stroke="#b45309" stroke-width="2" viewBox="0 0 24 24">
               <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
             </svg>`,
    },
  ];

  document.getElementById('metrics').innerHTML = cards.map(c => `
    <div class="kpi-card" style="--kpi-color:${c.color};--kpi-bg:${c.bg}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <span class="label">${c.label}</span>
        <div class="kpi-icon" style="background:${c.bg}">${c.icon}</div>
      </div>
      <div class="value" style="color:${c.color}">${c.value}</div>
      <div class="sub">${c.sub}</div>
      ${c.extra || ''}
    </div>`).join('');
}

// ─── Gasto por tipo ───────────────────────────────────────────
function renderDistribucionTipo(s) {
  const el = document.getElementById('dist-tipo');
  const lbl = document.getElementById('anio-tipo');
  if (!el) return;
  if (lbl) lbl.textContent = s.anio;

  const porTipo = {}, ocPorTipo = {};
  s.gasto_por_tipo.forEach(g => {
    if (g.moneda !== 'MXN') return;
    porTipo[g.tipo]  = (porTipo[g.tipo]  || 0) + +g.total;
    ocPorTipo[g.tipo] = (ocPorTipo[g.tipo] || 0) + +g.num_oc;
  });

  const total = Object.values(porTipo).reduce((a, b) => a + b, 0);
  const COLORES = { SERVICIOS: '#185FA5', PARTES: '#0f766e', FLETES: '#b45309' };

  if (!total) {
    el.innerHTML = '<p style="font-size:12px;color:var(--muted)">Sin datos de gasto para este año</p>';
    return;
  }

  el.innerHTML = Object.entries(porTipo)
    .sort((a, b) => b[1] - a[1])
    .map(([tipo, monto]) => {
      const c = COLORES[tipo] || '#64748b';
      return `<div class="dist-row">
        <div class="dist-label-row">
          <span style="font-weight:600;color:${c};font-size:12.5px">${tipo}</span>
          <span style="font-size:12px">${fmt(monto, 'MXN')}
            <span style="color:var(--muted)">${pct(monto, total)}%</span>
          </span>
        </div>
        ${distBar(monto, total, c)}
        <div class="dist-meta">${ocPorTipo[tipo] || 0} órdenes de compra</div>
      </div>`;
    }).join('');
}

// ─── Top proveedores ──────────────────────────────────────────
function renderTopProveedores(s) {
  const el = document.getElementById('top-proveedores');
  if (!el) return;
  const mxn = s.top_proveedores.filter(p => p.moneda === 'MXN');
  if (!mxn.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--muted)">Sin datos para este año</p>';
    return;
  }
  const max = +mxn[0].total;
  el.innerHTML = mxn.map((p, i) => `
    <div class="dist-row">
      <div class="dist-label-row">
        <span style="font-weight:600;font-size:12px;max-width:55%;overflow:hidden;
                     text-overflow:ellipsis;white-space:nowrap" title="${p.proveedor}">
          ${i + 1}. ${p.proveedor}
        </span>
        <span style="font-size:12px">${fmt(+p.total, 'MXN')}</span>
      </div>
      ${distBar(+p.total, max, '#185FA5')}
      <div class="dist-meta">${p.num_oc} órdenes</div>
    </div>`).join('');
}

// ─── Top departamentos ────────────────────────────────────────
function renderTopDepartamentos(s) {
  const el = document.getElementById('top-departamentos');
  if (!el) return;
  if (!s.top_departamentos.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--muted)">Sin datos para este año</p>';
    return;
  }
  const maxT = +s.top_departamentos[0].total;
  el.innerHTML = s.top_departamentos.map(d => {
    const tasa = pct(+d.aprobados, +d.total);
    return `<div class="dist-row">
      <div class="dist-label-row">
        <span style="font-weight:600;font-size:12px;max-width:65%;overflow:hidden;
                     text-overflow:ellipsis;white-space:nowrap" title="${d.departamento}">
          ${d.departamento}
        </span>
        <span style="font-size:12px">${d.total} req</span>
      </div>
      ${distBar(+d.total, maxT, '#7c3aed')}
      <div class="dist-meta">${tasa}% aprobados</div>
    </div>`;
  }).join('');
}

// ─── Aging ────────────────────────────────────────────────────
function renderAging(s) {
  const el    = document.getElementById('tabla-aging');
  const count = document.getElementById('aging-count');
  if (!el) return;

  if (count) count.textContent = s.aging_reqs.length || '';
  if (count) count.style.display = s.aging_reqs.length ? '' : 'none';

  if (!s.aging_reqs.length) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:10px 0;
                  font-size:13px;color:var(--muted)">
        <svg width="16" height="16" fill="none" stroke="#1D9E75" stroke-width="2" viewBox="0 0 24 24">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        Sin requerimientos pendientes de revisión
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="table-wrap">
      <table class="table-sm">
        <thead><tr>
          <th>Consecutivo</th><th>Tipo</th>
          <th>Departamento</th><th>Solicitante</th><th>Espera</th><th></th>
        </tr></thead>
        <tbody>${s.aging_reqs.map(r => `
          <tr>
            <td class="fw-600">${r.consecutivo}</td>
            <td>${r.tipo}</td>
            <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                title="${r.departamento || ''}">${r.departamento || '—'}</td>
            <td>${r.solicitante}</td>
            <td>${badgeDias(r.dias_espera)}</td>
            <td><a href="requerimientos.html?id=${r.id}" class="btn btn-sm btn-outline">Ver</a></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ─── OC activas ───────────────────────────────────────────────
async function renderOCActivas() {
  const el    = document.getElementById('tabla-oc');
  const count = document.getElementById('oc-activas-count');
  if (!el) return;
  UI.spinner(el);
  try {
    const { datos, total } = await Api.get('/ordenes-compra?estado=activas&limite=20');
    if (count) {
      count.textContent = total || '';
      count.style.display = total ? '' : 'none';
    }
    if (!datos.length) {
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:10px 0;
                    font-size:13px;color:var(--muted)">
          <svg width="16" height="16" fill="none" stroke="#1D9E75" stroke-width="2" viewBox="0 0 24 24">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          Sin órdenes de compra activas
        </div>`;
      return;
    }
    el.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
        <a href="ordenes.html?estado=activas" class="btn btn-sm btn-outline">Ver todas en Órdenes →</a>
      </div>
      <div class="table-wrap">
        <table class="table-sm">
          <thead><tr>
            <th>Número OC</th><th>Req.</th><th>Tipo</th><th>Proveedor</th>
            <th>PO DataTextNow</th><th>Monto</th><th>Estado</th><th></th>
          </tr></thead>
          <tbody>${datos.map(o => `
            <tr>
              <td class="fw-600">${o.numero_oc}</td>
              <td>${o.consecutivo || '—'}</td>
              <td>${o.tipo}</td>
              <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                  title="${o.proveedor_nombre || ''}">${UI.labelProveedor(o)}</td>
              <td>${o.datatextnow_id
                ? `<span class="fw-600">${o.datatextnow_id}</span>`
                : '<span style="color:#b45309;font-size:12px">Sin PO</span>'}
              </td>
              <td class="fw-600" style="white-space:nowrap">
                ${o.monto_total
                  ? `<span style="color:var(--primary)">${fmt(o.monto_total, o.moneda || 'MXN')}</span>`
                  : '<span style="color:var(--muted)">—</span>'}
              </td>
              <td>${UI.badge(o.estado)}</td>
              <td><a href="ordenes.html?id=${o.id}" class="btn btn-sm btn-outline">Ver</a></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch { UI.empty(el, 'Error al cargar órdenes activas'); }
}

// ─── Reporte discreto (solo contabilidad/admin) ───────────────
function inicializarReporteStatus() {
  const user = Auth.getUsuario();
  const btn  = document.getElementById('btn-reporte');
  if (!btn) return;
  if (!user || !['contabilidad', 'admin'].includes(user.rol)) return;

  btn.style.display = 'flex';
  btn.addEventListener('click', () => {
    if (window.Reportes?.descargarStatusPOS) {
      Reportes.descargarStatusPOS(anioActual);
    } else {
      Toast.error('No se pudo cargar el módulo de reportes');
    }
  });
}

// ─── Carga principal ──────────────────────────────────────────
async function cargarDashboard() {
  // Spinner en las KPI cards
  document.getElementById('metrics').innerHTML = Array(4).fill(
    `<div class="kpi-card" style="--kpi-color:#e5e7eb">
       <div class="label">Cargando…</div>
       <div class="value" style="color:#e5e7eb">——</div>
     </div>`
  ).join('');

  try {
    const s = await Api.get(`/dashboard/stats?anio=${anioActual}`);
    renderKPIs(s);
    renderDistribucionTipo(s);
    renderTopProveedores(s);
    renderTopDepartamentos(s);
    renderAging(s);
  } catch (err) {
    Toast.error('Error al cargar estadísticas del dashboard');
    console.error(err);
  }

  renderOCActivas();
}

cargarDashboard();
inicializarReporteStatus();
