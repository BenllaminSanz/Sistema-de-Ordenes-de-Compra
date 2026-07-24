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
function sumEstados(lista, predicado) {
  return (lista || []).reduce((acc, r) => {
    if (!predicado || predicado(r.estado)) return acc + (+r.total || 0);
    return acc;
  }, 0);
}

function renderKPIs(s) {
  const reqMap = {}, ocMap = {}, ocHistMap = {};
  (s.estados_req || []).forEach(r => { reqMap[r.estado] = +r.total; });
  (s.estados_oc || []).forEach(o => { ocMap[o.estado] = +o.total; });
  (s.estados_oc_hist || s.estados_oc || []).forEach(o => { ocHistMap[o.estado] = +o.total; });

  const totalReqs  = Object.values(reqMap).reduce((a, b) => a + b, 0);
  const enRevision = reqMap['en_revision'] || 0;
  const aprobados  = reqMap['aprobado'] || 0;
  const rechazados = reqMap['rechazado'] || 0;
  const reqAbiertos = enRevision + aprobados + (reqMap['incompleto'] || 0) + (reqMap['borrador'] || 0);

  // OC activas: del resumen en vivo (histórico operativo) o del año
  const resumenActivas = s.oc_activas_resumen || [];
  const ocDist = resumenActivas.filter(r => r.estado === 'distribuida').reduce((a, r) => a + +r.total, 0);
  const ocProc = resumenActivas.filter(r => r.estado === 'en_proceso').reduce((a, r) => a + +r.total, 0);
  const ocGen  = resumenActivas.filter(r => r.estado === 'generada').reduce((a, r) => a + +r.total, 0);
  const ocRec  = resumenActivas.filter(r => r.estado === 'recibida').reduce((a, r) => a + +r.total, 0);
  const ocEnVuelo = ocDist + ocProc + ocGen + ocRec
    || sumEstados(s.estados_oc_hist || s.estados_oc, (e) =>
      ['generada', 'distribuida', 'en_proceso', 'recibida'].includes(e));

  const ocCerradasAnio = ocMap['cerrada'] || 0;
  const ocCerradasHist = ocHistMap['cerrada'] || 0;
  const totalOCHist = Object.values(ocHistMap).reduce((a, b) => a + b, 0);
  const ciclo = s.ciclo?.dias_promedio;

  const gastoMXN = (s.gasto_por_tipo || []).filter(g => g.moneda === 'MXN').reduce((a, g) => a + +g.total, 0);
  const gastoUSD = (s.gasto_por_tipo || []).filter(g => g.moneda === 'USD').reduce((a, g) => a + +g.total, 0);
  const gastoEUR = (s.gasto_por_tipo || []).filter(g => g.moneda === 'EUR').reduce((a, g) => a + +g.total, 0);

  let subGasto = [];
  if (gastoUSD) subGasto.push(`${fmt(gastoUSD, 'USD')} USD`);
  if (gastoEUR) subGasto.push(`${fmt(gastoEUR, 'EUR')} EUR`);
  if (!subGasto.length) subGasto.push('Solo montos en MXN / sin otras monedas');

  const subOcActivas = [
    ocDist ? `${ocDist} distrib.` : null,
    ocProc ? `${ocProc} parcial/proceso` : null,
    ocGen ? `${ocGen} generadas` : null,
    ocRec ? `${ocRec} recibidas` : null,
  ].filter(Boolean).join(' · ') || 'Sin desglose';

  const cards = [
    {
      label: `Requerimientos ${s.anio}`,
      value: totalReqs.toLocaleString('es-MX'),
      sub: `${reqAbiertos} abiertos · ${enRevision} en revisión · ${aprobados} aprob. · ${rechazados} rech.`,
      color: '#185FA5', bg: '#e6f1fb',
      icon: `<svg width="16" height="16" fill="none" stroke="#185FA5" stroke-width="2" viewBox="0 0 24 24">
               <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2"/>
             </svg>`,
      extra: sparkline(s.volumen_mensual),
    },
    {
      label: `Gasto MXN ${s.anio}`,
      value: fmt(gastoMXN, 'MXN'),
      sub: subGasto.join(' · '),
      color: '#0f766e', bg: '#d1fae5',
      icon: `<svg width="16" height="16" fill="none" stroke="#0f766e" stroke-width="2" viewBox="0 0 24 24">
               <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
             </svg>`,
    },
    {
      label: 'OC activas (no concluidas)',
      value: ocEnVuelo.toLocaleString('es-MX'),
      sub: `${subOcActivas} · ${ocCerradasHist.toLocaleString('es-MX')} cerradas hist. · ${totalOCHist.toLocaleString('es-MX')} OC total`,
      color: '#7c3aed', bg: '#ede9fe',
      icon: `<svg width="16" height="16" fill="none" stroke="#7c3aed" stroke-width="2" viewBox="0 0 24 24">
               <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
             </svg>`,
      link: 'ordenes.html?estado=activas',
    },
    {
      label: `Ciclo req → PO (${s.anio})`,
      value: ciclo != null && !Number.isNaN(+ciclo) ? `${ciclo}d` : '—',
      sub: ciclo != null && s.ciclo
        ? `Mín ${s.ciclo.dias_min}d · Máx ${s.ciclo.dias_max}d`
          + (s.ciclo.muestra != null ? ` · n=${s.ciclo.muestra}` : '')
          + ` · cerradas año: ${ocCerradasAnio}`
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
      <div class="value" style="color:${c.color}">
        ${c.link ? `<a href="${c.link}" style="color:inherit;text-decoration:none">${c.value}</a>` : c.value}
      </div>
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

  const porTipo = {}, ocPorTipo = {}, otrasMonedas = {};
  (s.gasto_por_tipo || []).forEach(g => {
    if (g.moneda === 'MXN') {
      porTipo[g.tipo] = (porTipo[g.tipo] || 0) + +g.total;
      ocPorTipo[g.tipo] = (ocPorTipo[g.tipo] || 0) + +g.num_oc;
    } else {
      const k = `${g.tipo} ${g.moneda}`;
      otrasMonedas[k] = (otrasMonedas[k] || 0) + +g.total;
    }
  });

  const total = Object.values(porTipo).reduce((a, b) => a + b, 0);
  const COLORES = { SERVICIOS: '#185FA5', PARTES: '#0f766e', FLETES: '#b45309' };

  if (!total && !Object.keys(otrasMonedas).length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--muted)">Sin datos de gasto para este año</p>';
    return;
  }

  let html = Object.entries(porTipo)
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
        <div class="dist-meta">${ocPorTipo[tipo] || 0} órdenes · MXN</div>
      </div>`;
    }).join('');

  if (Object.keys(otrasMonedas).length) {
    html += `<div style="margin-top:10px;padding-top:8px;border-top:1px solid #f1f5f9;font-size:11.5px;color:var(--muted)">
      <div style="font-weight:600;margin-bottom:4px;color:#475569">Otras monedas</div>
      ${Object.entries(otrasMonedas).map(([k, v]) => {
        const mon = k.split(' ').pop();
        return `<div style="display:flex;justify-content:space-between;margin-bottom:2px">
          <span>${k}</span><span>${fmt(v, mon)}</span></div>`;
      }).join('')}
    </div>`;
  }

  el.innerHTML = html;
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

// ─── Top departamentos / áreas ────────────────────────────────
function renderTopDepartamentos(s) {
  const el = document.getElementById('top-departamentos');
  if (!el) return;
  if (!s.top_departamentos?.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--muted)">Sin datos de área/depto para este año</p>';
    return;
  }
  const maxT = +s.top_departamentos[0].total;
  el.innerHTML = s.top_departamentos.map(d => {
    const abiertos = d.abiertos != null ? +d.abiertos : null;
    const meta = abiertos != null
      ? `${abiertos} abiertos · ${d.cerrados != null ? d.cerrados + ' cerrados' : (pct(+d.aprobados, +d.total) + '% con avance')}`
      : `${pct(+d.aprobados, +d.total)}% con avance`;
    return `<div class="dist-row">
      <div class="dist-label-row">
        <span style="font-weight:600;font-size:12px;max-width:65%;overflow:hidden;
                     text-overflow:ellipsis;white-space:nowrap" title="${UI.esc(d.departamento || '')}">
          ${UI.esc(d.departamento || '—')}
        </span>
        <span style="font-size:12px">${d.total} req</span>
      </div>
      ${distBar(+d.total, maxT, '#7c3aed')}
      <div class="dist-meta">${meta}</div>
    </div>`;
  }).join('');
}

// ─── Aging ────────────────────────────────────────────────────
function renderAging(s) {
  const el    = document.getElementById('tabla-aging');
  const count = document.getElementById('aging-count');
  if (!el) return;

  const rows = s.aging_reqs || [];
  if (count) {
    count.textContent = rows.length || '';
    count.style.display = rows.length ? '' : 'none';
  }

  if (!rows.length) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:10px 0;
                  font-size:13px;color:var(--muted)">
        <svg width="16" height="16" fill="none" stroke="#1D9E75" stroke-width="2" viewBox="0 0 24 24">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        Sin requerimientos pendientes (revisión / aprobado / incompleto)
      </div>`;
    return;
  }

  el.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px;gap:8px;flex-wrap:wrap">
      <a href="requerimientos.html?estado=activos" class="btn btn-sm btn-outline">Ver REQ activos →</a>
    </div>
    <div class="table-wrap">
      <table class="table-sm">
        <thead><tr>
          <th>Consecutivo</th><th>Tipo</th><th>Estado</th>
          <th>Área / Depto</th><th>Solicitante</th><th>Espera</th><th></th>
        </tr></thead>
        <tbody>${rows.map(r => {
          const depto = r.departamento || r.area || '—';
          return `
          <tr>
            <td class="fw-600">${r.consecutivo || '—'}</td>
            <td>${r.tipo || '—'}</td>
            <td>${UI.badge(r.estado || 'en_revision')}</td>
            <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                title="${UI.esc(depto)}">${UI.esc(depto)}</td>
            <td>${UI.esc(r.solicitante || '—')}</td>
            <td>${badgeDias(r.dias_espera)}</td>
            <td><a href="requerimientos.html?id=${r.id}" class="btn btn-sm btn-outline">Ver</a></td>
          </tr>`;
        }).join('')}
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
            <th>PO DTN</th><th>Req.</th><th>Tipo</th><th>Proveedor</th>
            <th>Monto</th><th>Estado</th><th></th>
          </tr></thead>
          <tbody>${datos.map(o => `
            <tr>
              <td class="fw-600">${o.datatextnow_id
                ? UI.esc(String(o.datatextnow_id))
                : '<span style="color:#b45309;font-size:12px">Sin PO</span>'}</td>
              <td>${o.consecutivo || o.numero_oc || '—'}</td>
              <td>${o.tipo || '—'}</td>
              <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                  title="${UI.esc(o.proveedor_nombre || '')}">${UI.labelProveedor(o)}</td>
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

// ─── Export BASE GRAL (solo contabilidad/admin) ───────────────
function inicializarReporteStatus() {
  const user = Auth.getUsuario();
  const btn  = document.getElementById('btn-reporte');
  if (!btn) return;
  if (!user || !['contabilidad', 'admin'].includes(user.rol)) return;

  btn.style.display = 'inline-flex';
  if (window.ExcelUI?.htmlExport) btn.innerHTML = ExcelUI.htmlExport();
  btn.title = 'Exportar BASE GRAL del año: todos los REQ y OC';
  btn.addEventListener('click', () => {
    if (window.Reportes?.descargarBaseGral) {
      Reportes.descargarBaseGral(anioActual, btn);
    } else if (window.Reportes?.descargarStatusPOS) {
      Reportes.descargarStatusPOS(anioActual, btn);
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
