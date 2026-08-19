/**
 * dashboard.js — KPIs reales + layout 2 columnas
 */

Auth.requiereAuth();
renderSidebar();
renderTopbar('Dashboard');

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const HOY   = new Date();
let anioActual = HOY.getFullYear();
const esSolicitante = Auth.getUsuario()?.rol === 'solicitante';

function tituloDashboard(anio) {
  return esSolicitante ? `Mi panel ${anio}` : `Dashboard ${anio}`;
}

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
    document.getElementById('dash-titulo').textContent = tituloDashboard(anioActual);
    cargarDashboard();
  });
  document.getElementById('dash-titulo').textContent = tituloDashboard(anioActual);
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
  const recibidos  = reqMap['recibido'] || 0;
  const aprobados  = reqMap['aprobado'] || 0;
  const rechazados = reqMap['rechazado'] || 0;
  const reqAbiertos = enRevision + recibidos + aprobados + (reqMap['incompleto'] || 0) + (reqMap['borrador'] || 0);

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

  const mio = s.alcance === 'propio' || esSolicitante;
  // Bandeja: pendientes de acuse (en_revision) e histórico
  let enRevisionHist = enRevision;
  let recibidosHist = recibidos;
  (s.estados_req_hist || []).forEach((r) => {
    if (r.estado === 'en_revision') enRevisionHist = +r.total || enRevision;
    if (r.estado === 'recibido') recibidosHist = +r.total || recibidos;
  });
  const porRecibir = mio ? enRevision : enRevisionHist;
  const enTrabajo = mio ? recibidos : recibidosHist;

  const cards = [
    {
      label: mio ? 'Mis REQ en revisión' : 'Por recibir (acuse Compras)',
      value: porRecibir.toLocaleString('es-MX'),
      sub: mio
        ? 'Enviados a Compras, pendientes de acuse/respuesta'
        : `${enTrabajo} ya recibidos en proceso · ${enRevision} por acuse en ${s.anio}`,
      color: '#c2410c', bg: '#ffedd5',
      icon: `<svg width="16" height="16" fill="none" stroke="#c2410c" stroke-width="2" viewBox="0 0 24 24">
               <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
             </svg>`,
      link: 'dashboard.html#bandeja',
      highlight: porRecibir > 0,
    },
    {
      label: mio ? `Mis requerimientos ${s.anio}` : `Requerimientos ${s.anio}`,
      value: totalReqs.toLocaleString('es-MX'),
      sub: `${reqAbiertos} abiertos · ${enRevision} pend. acuse · ${recibidos} recibidos · ${aprobados} aprob.`,
      color: '#185FA5', bg: '#e6f1fb',
      icon: `<svg width="16" height="16" fill="none" stroke="#185FA5" stroke-width="2" viewBox="0 0 24 24">
               <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2"/>
             </svg>`,
      extra: sparkline(s.volumen_mensual),
      link: 'requerimientos.html',
    },
    {
      label: mio ? 'Mis OC activas' : 'OC activas (no concluidas)',
      value: ocEnVuelo.toLocaleString('es-MX'),
      sub: `${subOcActivas} · ${ocCerradasHist.toLocaleString('es-MX')} cerradas hist. · ${totalOCHist.toLocaleString('es-MX')} OC total`,
      color: '#7c3aed', bg: '#ede9fe',
      icon: `<svg width="16" height="16" fill="none" stroke="#7c3aed" stroke-width="2" viewBox="0 0 24 24">
               <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
             </svg>`,
      link: 'dashboard.html#bandeja-oc',
      highlight: ocEnVuelo > 0,
    },
    {
      label: mio ? `Mi gasto MXN ${s.anio}` : `Gasto MXN ${s.anio}`,
      value: fmt(gastoMXN, 'MXN'),
      sub: subGasto.join(' · ')
        + (ciclo != null && !Number.isNaN(+ciclo) ? ` · ciclo req→PO ${ciclo}d` : ''),
      color: '#0f766e', bg: '#d1fae5',
      icon: `<svg width="16" height="16" fill="none" stroke="#0f766e" stroke-width="2" viewBox="0 0 24 24">
               <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
             </svg>`,
    },
  ];

  document.getElementById('metrics').innerHTML = cards.map(c => `
    <div class="kpi-card${c.highlight ? ' kpi-card-pulse' : ''}" style="--kpi-color:${c.color};--kpi-bg:${c.bg}">
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
    const label = [d.area, d.departamento].filter(Boolean).join(' / ') || d.departamento || '—';
    return `<div class="dist-row">
      <div class="dist-label-row">
        <span style="font-weight:600;font-size:12px;max-width:65%;overflow:hidden;
                     text-overflow:ellipsis;white-space:nowrap" title="${UI.esc(label)}">
          ${UI.esc(label)}
        </span>
        <span style="font-size:12px">${d.total} req</span>
      </div>
      ${distBar(+d.total, maxT, '#7c3aed')}
      <div class="dist-meta">${meta}</div>
    </div>`;
  }).join('');
}

// ─── Bandeja de trabajo (Dashboard) ───────────────────────────
// Si se entra con #bandeja (KPI / campana), abrir cola de acuse
let _bandejaCola = (!esSolicitante && location.hash === '#bandeja') ? 'por_recibir' : null;
let _bandejaData = null;

const COLAS_COMPRAS = [
  { id: 'por_recibir', label: 'Por recibir' },
  { id: 'en_proceso', label: 'En proceso' },
  { id: 'incompletos', label: 'Incompletos' },
  { id: 'listos_oc', label: 'Listos para OC' },
];

const COLAS_SOLICITANTE = [
  { id: 'pendientes', label: 'En curso' },
  { id: 'incompletos', label: 'Incompletos' },
];

function tabsBandeja() {
  return esSolicitante ? COLAS_SOLICITANTE : COLAS_COMPRAS;
}

function countCola(contadores, colaId) {
  const c = contadores || {};
  if (colaId === 'pendientes') {
    return (c.por_recibir || 0) + (c.en_proceso || 0) + (c.incompletos || 0);
  }
  return Number(c[colaId]) || 0;
}

function renderBandejaTabs(data) {
  const el = document.getElementById('bandeja-tabs');
  if (!el) return;
  const colaActiva = data.cola || _bandejaCola || tabsBandeja()[0].id;
  _bandejaCola = colaActiva;
  el.innerHTML = tabsBandeja().map((t) => {
    const n = countCola(data.contadores, t.id);
    const active = t.id === colaActiva ? ' active' : '';
    const has = n > 0 ? ' has-items' : '';
    return `<button type="button" class="bandeja-tab${active}${has}" data-cola="${t.id}"
                    role="tab" aria-selected="${t.id === colaActiva}">
      ${UI.esc(t.label)}
      <span class="bandeja-tab-count">${n}</span>
    </button>`;
  }).join('');

  if (!el.dataset.bound) {
    el.dataset.bound = '1';
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cola]');
      if (!btn) return;
      _bandejaCola = btn.dataset.cola;
      cargarBandeja();
    });
  }
}

function accionesBandeja(item) {
  const id = item.id;
  const estado = item.estado;
  const btns = [];

  if (!esSolicitante) {
    if (estado === 'en_revision') {
      btns.push(
        `<button type="button" class="btn btn-sm btn-primary" data-bandeja-accion="recibido" data-id="${id}"
                 title="Acuse formal de Compras">Recibido</button>`
      );
    }
    if (estado === 'recibido') {
      btns.push(
        `<button type="button" class="btn btn-sm btn-outline" data-bandeja-accion="incompleto" data-id="${id}"
                 title="Devolver al solicitante por información faltante">Incompleto</button>`
      );
    }
    if (estado === 'aprobado') {
      btns.push(
        `<a href="requerimientos.html?id=${id}" class="btn btn-sm btn-primary">Generar OC</a>`
      );
    }
  }

  btns.push(`<a href="requerimientos.html?id=${id}" class="btn btn-sm btn-outline">Ver</a>`);
  return `<div class="bandeja-actions">${btns.join('')}</div>`;
}

function renderBandejaTabla(data) {
  const el = document.getElementById('tabla-bandeja');
  if (!el) return;
  const items = data.items || [];

  if (!items.length) {
    const msgs = {
      por_recibir: 'No hay requerimientos pendientes de acuse',
      en_proceso: 'No hay requerimientos recibidos en proceso',
      incompletos: esSolicitante
        ? 'No tienes requerimientos incompletos'
        : 'No hay requerimientos incompletos',
      listos_oc: 'No hay requerimientos aprobados listos para OC',
      pendientes: 'No tienes requerimientos en curso',
    };
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:12px 0;
                  font-size:13px;color:var(--muted)">
        <svg width="16" height="16" fill="none" stroke="#1D9E75" stroke-width="2" viewBox="0 0 24 24">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        ${msgs[data.cola] || 'Sin pendientes en esta cola'}
      </div>`;
    return;
  }

  const colSol = esSolicitante ? '' : '<th>Solicitante</th>';
  el.innerHTML = `
    <div class="table-wrap">
      <table class="table-sm">
        <thead><tr>
          <th>Consecutivo</th>
          <th>Tipo</th>
          <th>Estado</th>
          <th>Área / Depto</th>
          ${colSol}
          <th>Espera</th>
          <th style="text-align:right">Acciones</th>
        </tr></thead>
        <tbody>
          ${items.map((r) => {
            const areaDepto = [r.area, r.departamento].filter(Boolean).join(' / ') || '—';
            const titulo = r.titulo_solicitud || '';
            return `
            <tr>
              <td class="fw-600" title="${UI.esc(titulo)}">${UI.esc(r.consecutivo || '—')}</td>
              <td>${UI.esc(r.tipo || '—')}</td>
              <td>${UI.badge(r.estado)}</td>
              <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                  title="${UI.esc(areaDepto)}">${UI.esc(areaDepto)}</td>
              ${esSolicitante ? '' : `<td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                  title="${UI.esc(r.solicitante_nombre || '')}">${UI.esc(r.solicitante_nombre || '—')}</td>`}
              <td>${badgeDias(Number(r.dias_espera) || 0)}</td>
              <td>${accionesBandeja(r)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function actualizarCabeceraBandeja(data) {
  const titulo = document.getElementById('bandeja-titulo');
  const count = document.getElementById('bandeja-count');
  const link = document.getElementById('bandeja-link-todos');
  if (titulo) {
    titulo.textContent = esSolicitante ? 'Mis pendientes' : 'Bandeja Compras';
  }
  const c = data.contadores || {};
  const totalTrabajo = esSolicitante
    ? countCola(c, 'pendientes')
    : (c.por_recibir || 0) + (c.en_proceso || 0) + (c.incompletos || 0) + (c.listos_oc || 0);
  if (count) {
    if (totalTrabajo > 0) {
      count.style.display = '';
      count.textContent = String(totalTrabajo);
    } else {
      count.style.display = 'none';
    }
  }
  if (link && data.link_todos) {
    link.href = data.link_todos;
    link.textContent = esSolicitante ? 'Mis REQ →' : 'Ver en listado →';
  }
}

async function cargarBandeja() {
  const el = document.getElementById('tabla-bandeja');
  if (!el) return;
  UI.spinner(el);
  try {
    const cola = _bandejaCola ? `&cola=${encodeURIComponent(_bandejaCola)}` : '';
    const data = await Api.get(`/notificaciones/bandeja?limite=25${cola}`);
    _bandejaData = data;
    _bandejaCola = data.cola || _bandejaCola;
    actualizarCabeceraBandeja(data);
    renderBandejaTabs(data);
    renderBandejaTabla(data);
  } catch (err) {
    el.innerHTML = `<p class="text-muted text-sm" style="margin:8px 0">No se pudo cargar la bandeja</p>`;
    console.error(err);
  }
}

async function accionRapidaBandeja(id, estado) {
  let notas = null;
  if (estado === 'incompleto') {
    notas = window.prompt('¿Qué información falta? (se enviará como nota al solicitante)');
    if (notas === null) return; // canceló
    notas = String(notas).trim() || 'Marcado incompleto desde la bandeja';
  } else if (estado === 'recibido') {
    if (!window.confirm('¿Marcar como recibido por Compras?')) return;
    notas = 'Acuse formal de recibo (bandeja Dashboard)';
  }

  try {
    await Api.patch(`/requerimientos/${id}/estado`, { estado, notas });
    Toast.success(
      estado === 'recibido'
        ? 'Acuse de recibo registrado'
        : 'Requerimiento marcado como incompleto'
    );
    // Refrescar bandeja y KPIs del año
    await cargarBandeja();
    try {
      const s = await Api.get(`/dashboard/stats?anio=${anioActual}`);
      renderKPIs(s);
    } catch (_) { /* ignore */ }
    // Actualizar campana si está en el topbar
    if (typeof cargarNotificaciones === 'function') {
      cargarNotificaciones(false);
    }
  } catch (err) {
    Toast.error(err.mensaje || 'No se pudo actualizar el estado');
  }
}

function initBandejaActions() {
  const el = document.getElementById('tabla-bandeja');
  if (!el || el.dataset.bound) return;
  el.dataset.bound = '1';
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bandeja-accion]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id, 10);
    const accion = btn.dataset.bandejaAccion;
    if (!id || !accion) return;
    accionRapidaBandeja(id, accion);
  });
}

function focusBandejaSiHash() {
  if (location.hash !== '#bandeja') return;
  const card = document.getElementById('card-bandeja');
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  card.classList.add('bandeja-focus');
  setTimeout(() => card.classList.remove('bandeja-focus'), 2200);
  // Si se llega desde KPI "Por recibir", abrir esa cola (sin recargar si ya está)
  if (!esSolicitante && _bandejaCola !== 'por_recibir') {
    _bandejaCola = 'por_recibir';
    cargarBandeja();
  }
}

// ─── Bandeja OC (colas por estado) ────────────────────────────
let _bandejaOcCola = (location.hash === '#bandeja-oc') ? 'generada' : null;
let _bandejaOcData = null;

const COLAS_OC = [
  { id: 'generada', label: 'Generadas' },
  { id: 'distribuida', label: 'Distribuidas' },
  { id: 'en_proceso', label: 'En proceso' },
  { id: 'recibida', label: 'Recibidas' },
  { id: 'sin_po', label: 'Sin PO' },
];

function renderBandejaOcTabs(data) {
  const el = document.getElementById('bandeja-oc-tabs');
  if (!el) return;
  const colaActiva = data.cola || _bandejaOcCola || 'generada';
  _bandejaOcCola = colaActiva;
  const c = data.contadores || {};
  el.innerHTML = COLAS_OC.map((t) => {
    const n = Number(c[t.id]) || 0;
    const active = t.id === colaActiva ? ' active' : '';
    const has = n > 0 ? ' has-items' : '';
    return `<button type="button" class="bandeja-tab${active}${has}" data-cola-oc="${t.id}"
                    role="tab" aria-selected="${t.id === colaActiva}">
      ${UI.esc(t.label)}
      <span class="bandeja-tab-count">${n}</span>
    </button>`;
  }).join('');

  if (!el.dataset.bound) {
    el.dataset.bound = '1';
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cola-oc]');
      if (!btn) return;
      _bandejaOcCola = btn.dataset.colaOc;
      cargarBandejaOc();
    });
  }
}

function accionesBandejaOc(item) {
  const id = item.id;
  const estado = item.estado;
  const btns = [];

  if (!esSolicitante) {
    if (estado === 'generada') {
      btns.push(
        `<button type="button" class="btn btn-sm btn-primary" data-oc-accion="distribuida" data-id="${id}"
                 title="Marcar como distribuida al proveedor">Distribuir</button>`
      );
    }
    if (estado === 'distribuida') {
      btns.push(
        `<button type="button" class="btn btn-sm btn-primary" data-oc-accion="en_proceso" data-id="${id}"
                 title="Pasar a en proceso / entrega parcial">En proceso</button>`
      );
    }
    // Cierre y recepción se hacen en el detalle (validaciones de PO / recepciones)
  }

  btns.push(`<a href="ordenes.html?id=${id}" class="btn btn-sm btn-outline">Ver</a>`);
  return `<div class="bandeja-actions">${btns.join('')}</div>`;
}

function celdaPoOc(o) {
  const po = o.datatextnow_id != null ? String(o.datatextnow_id).trim() : '';
  if (!po || po.toUpperCase() === 'NA') {
    return '<span style="color:#b45309;font-size:12px;font-weight:600">Sin PO</span>';
  }
  return `<span class="fw-600">${UI.esc(po)}</span>`;
}

function renderBandejaOcTabla(data) {
  const el = document.getElementById('tabla-oc');
  if (!el) return;
  const items = data.items || [];

  if (!items.length) {
    const msgs = {
      generada: esSolicitante ? 'No tienes OC generadas pendientes' : 'No hay OC generadas pendientes',
      distribuida: 'No hay OC distribuidas en esta cola',
      en_proceso: 'No hay OC en proceso',
      recibida: 'No hay OC recibidas pendientes de cierre',
      sin_po: 'Todas las OC activas tienen PO de DataTextNow',
    };
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:12px 0;
                  font-size:13px;color:var(--muted)">
        <svg width="16" height="16" fill="none" stroke="#1D9E75" stroke-width="2" viewBox="0 0 24 24">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        ${msgs[data.cola] || 'Sin órdenes en esta cola'}
      </div>`;
    return;
  }

  const colSol = esSolicitante ? '' : '<th>Solicitante</th>';
  el.innerHTML = `
    <div class="table-wrap">
      <table class="table-sm">
        <thead><tr>
          <th>PO DTN</th>
          <th>No. OC</th>
          <th>Tipo</th>
          <th>Proveedor</th>
          ${colSol}
          <th>Monto</th>
          <th>Estado</th>
          <th>Espera</th>
          <th style="text-align:right">Acciones</th>
        </tr></thead>
        <tbody>
          ${items.map((o) => {
            const prov = (typeof UI.labelProveedor === 'function')
              ? UI.labelProveedor(o)
              : UI.esc(o.proveedor_nombre || '—');
            return `
            <tr>
              <td>${celdaPoOc(o)}</td>
              <td class="fw-600">${UI.esc(o.numero_oc || o.consecutivo || '—')}</td>
              <td>${UI.esc(o.tipo || '—')}</td>
              <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                  title="${UI.esc(o.proveedor_nombre || '')}">${prov}</td>
              ${esSolicitante ? '' : `<td style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                  title="${UI.esc(o.solicitante_nombre || '')}">${UI.esc(o.solicitante_nombre || '—')}</td>`}
              <td class="fw-600" style="white-space:nowrap">
                ${o.monto_total != null
                  ? `<span style="color:var(--primary)">${fmt(o.monto_total, o.moneda || 'MXN')}</span>`
                  : '<span style="color:var(--muted)">—</span>'}
              </td>
              <td>${UI.badge(o.estado)}</td>
              <td>${badgeDias(Number(o.dias_espera) || 0)}</td>
              <td>${accionesBandejaOc(o)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function actualizarCabeceraBandejaOc(data) {
  const titulo = document.getElementById('oc-activas-titulo');
  const count = document.getElementById('oc-activas-count');
  const link = document.getElementById('bandeja-oc-link-todos');
  if (titulo) {
    titulo.textContent = esSolicitante ? 'Mis OC activas' : 'Bandeja OC';
  }
  const total = Number(data.contadores?.activas) || 0;
  if (count) {
    if (total > 0) {
      count.style.display = '';
      count.textContent = String(total);
    } else {
      count.style.display = 'none';
    }
  }
  if (link) {
    link.href = data.link_todos || 'ordenes.html?estado=activas';
    link.textContent = esSolicitante ? 'Mis órdenes →' : 'Ver en listado →';
  }
}

async function cargarBandejaOc() {
  const el = document.getElementById('tabla-oc');
  if (!el) return;
  UI.spinner(el);
  try {
    const cola = _bandejaOcCola ? `&cola=${encodeURIComponent(_bandejaOcCola)}` : '';
    const data = await Api.get(`/notificaciones/bandeja-oc?limite=25${cola}`);
    _bandejaOcData = data;
    _bandejaOcCola = data.cola || _bandejaOcCola;
    actualizarCabeceraBandejaOc(data);
    renderBandejaOcTabs(data);
    renderBandejaOcTabla(data);
  } catch (err) {
    el.innerHTML = `<p class="text-muted text-sm" style="margin:8px 0">No se pudo cargar la bandeja de OC</p>`;
    console.error(err);
  }
}

async function accionRapidaOc(id, estado) {
  const labels = {
    distribuida: '¿Marcar esta OC como distribuida?',
    en_proceso: '¿Pasar esta OC a en proceso?',
  };
  if (!window.confirm(labels[estado] || '¿Cambiar estado de la OC?')) return;

  const notas = estado === 'distribuida'
    ? 'Distribuida desde bandeja Dashboard'
    : 'En proceso desde bandeja Dashboard';

  try {
    await Api.patch(`/ordenes-compra/${id}/estado`, { estado, notas });
    Toast.success(estado === 'distribuida' ? 'OC marcada como distribuida' : 'OC en proceso');
    await cargarBandejaOc();
    try {
      const s = await Api.get(`/dashboard/stats?anio=${anioActual}`);
      renderKPIs(s);
    } catch (_) { /* ignore */ }
  } catch (err) {
    Toast.error(err.mensaje || 'No se pudo actualizar la OC');
  }
}

function initBandejaOcActions() {
  const el = document.getElementById('tabla-oc');
  if (!el || el.dataset.boundOc) return;
  el.dataset.boundOc = '1';
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-oc-accion]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id, 10);
    const accion = btn.dataset.ocAccion;
    if (!id || !accion) return;
    accionRapidaOc(id, accion);
  });
}

function focusBandejaOcSiHash() {
  if (location.hash !== '#bandeja-oc') return;
  const card = document.getElementById('card-bandeja-oc');
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  card.classList.add('bandeja-focus');
  setTimeout(() => card.classList.remove('bandeja-focus'), 2200);
  // Desde KPI: priorizar generadas; si no hay, la API elige
  if (_bandejaOcCola !== 'generada' && _bandejaOcCola !== 'sin_po') {
    _bandejaOcCola = 'generada';
    cargarBandejaOc();
  }
}

// ─── Export BASE GRAL (solo compras/admin) ───────────────
function inicializarReporteStatus() {
  const user = Auth.getUsuario();
  const btn  = document.getElementById('btn-reporte');
  if (!btn) return;
  if (!user || !['compras', 'admin'].includes(user.rol)) return;

  btn.style.display = 'inline-flex';
  if (window.ExcelUI?.htmlExport) btn.innerHTML = ExcelUI.htmlExport();
  btn.title = 'Exportar BASE GRAL: año, mes, rango o completo (REQ + OC)';
  btn.addEventListener('click', () => {
    if (window.Reportes?.solicitarPeriodoExportacion) {
      Reportes.solicitarPeriodoExportacion({
        titulo: 'Exportar BASE GRAL (REQ + OC)',
        btn,
        alConfirmar: (periodo, boton) => Reportes.descargarBaseGral(periodo, boton),
      });
    } else if (window.Reportes?.descargarBaseGral) {
      Reportes.descargarBaseGral(anioActual, btn);
    } else {
      Toast.error('No se pudo cargar el módulo de reportes');
    }
  });
}

// Ajustes de textos de secciones según rol
(function ajustarTitulosSolicitante() {
  if (!esSolicitante) return;
  const bandejaTit = document.getElementById('bandeja-titulo');
  const ocTit = document.getElementById('oc-activas-titulo');
  if (bandejaTit) bandejaTit.textContent = 'Mis pendientes';
  if (ocTit) ocTit.textContent = 'Mis OC activas';
  const topProvCard = document.querySelector('#top-proveedores')?.closest('.card')?.querySelector('.card-title');
  if (topProvCard) {
    const svg = topProvCard.querySelector('svg');
    topProvCard.innerHTML = '';
    if (svg) topProvCard.appendChild(svg);
    topProvCard.appendChild(document.createTextNode(' Mis proveedores (gasto MXN)'));
  }
  const topDeptoCard = document.querySelector('#top-departamentos')?.closest('.card')?.querySelector('.card-title');
  if (topDeptoCard) {
    const svg = topDeptoCard.querySelector('svg');
    topDeptoCard.innerHTML = '';
    if (svg) topDeptoCard.appendChild(svg);
    topDeptoCard.appendChild(document.createTextNode(' Mis áreas / deptos'));
  }
})();

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
  } catch (err) {
    Toast.error('Error al cargar estadísticas del dashboard');
    console.error(err);
  }

  await Promise.all([cargarBandeja(), cargarBandejaOc()]);
  focusBandejaSiHash();
  focusBandejaOcSiHash();
}

initBandejaActions();
initBandejaOcActions();
cargarDashboard();
inicializarReporteStatus();
window.addEventListener('hashchange', () => {
  focusBandejaSiHash();
  focusBandejaOcSiHash();
});
