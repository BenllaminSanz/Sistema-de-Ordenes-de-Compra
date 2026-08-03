/**
 * areas.js — Administración de áreas y departamentos
 */

const ICON_EDIT = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const ICON_PLUS = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const ICON_TRASH = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;

const ACCION_LABEL = {
  area_creada: 'Área creada',
  area_actualizada: 'Área renombrada',
  area_eliminada: 'Área eliminada',
  departamento_creado: 'Departamento creado',
  departamento_actualizado: 'Departamento actualizado',
  departamento_eliminado: 'Departamento eliminado',
};

let _areas = [];
let _editandoAreaId = null;
let _editandoDeptoArea = null;
let _editandoDeptoNombre = null;

Auth.requiereAuth();
if (!Auth.puedeHacer(['admin', 'compras'])) {
  window.location.href = 'dashboard.html';
}
renderSidebar();
renderTopbar('Áreas y Departamentos');

async function cargarAreas() {
  const cont = document.getElementById('lista-areas');
  try {
    const data = await Api.get('/areas');
    _areas = data.areas || [];
    renderAreas();
  } catch {
    cont.innerHTML = '<p class="text-muted">Error al cargar áreas.</p>';
    Toast.error('No se pudo cargar la configuración de áreas');
  }
}

async function cargarHistorial() {
  const cont = document.getElementById('historial-areas');
  if (!cont) return;
  UI.spinner(cont);
  try {
    const { entradas } = await Api.get('/areas/historial?limite=30');
    if (!entradas.length) {
      UI.empty(cont, 'Sin cambios registrados aún');
      return;
    }
    cont.innerHTML = `
      <div class="table-wrap">
        <table class="table-sm">
          <thead><tr>
            <th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th>
          </tr></thead>
          <tbody>${entradas.map(e => `
            <tr>
              <td class="text-muted text-sm" style="white-space:nowrap">${UI.fecha(e.at)}</td>
              <td>${escHtml(e.usuario_nombre || '—')}</td>
              <td>${escHtml(ACCION_LABEL[e.accion] || e.accion)}</td>
              <td class="text-sm" style="max-width:280px">${escHtml(resumirDetalle(e))}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch {
    UI.empty(cont, 'Error al cargar historial');
  }
}

function resumirDetalle(e) {
  const d = e.detalle || {};
  if (e.accion === 'departamento_creado') {
    return `${d.area_label || d.area_id}: ${d.nombre}${d.codigo ? ` (${d.codigo})` : ''}`;
  }
  if (e.accion === 'departamento_eliminado' || e.accion === 'departamento_actualizado') {
    const reqs = d.requerimientos_historicos;
    const extra = reqs != null ? ` · ${reqs} req. históricos` : '';
    return `${d.nombre || d.anterior?.nombre || ''}${extra}`;
  }
  if (e.accion === 'area_eliminada') {
    return `${d.label} · ${d.departamentos} deptos · ${d.requerimientos_historicos} req.`;
  }
  return d.label || d.area_id || JSON.stringify(d);
}

function renderAreas() {
  const cont = document.getElementById('lista-areas');
  if (!_areas.length) {
    cont.innerHTML = '<p class="text-muted" style="text-align:center;padding:32px;">Sin áreas configuradas.</p>';
    return;
  }

  cont.innerHTML = _areas.map(area => `
    <div class="area-card" id="area-card-${area.id}">
      <div class="area-header" onclick="toggleArea('${area.id}')">
        <svg class="area-chevron" width="14" height="14" fill="none" stroke="currentColor"
             stroke-width="2.5" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
        <span class="area-label">${escHtml(area.label || area.id)}</span>
        ${area.id !== area.label
          ? `<span class="area-id-badge" title="ID interno">${escHtml(area.id)}</span>`
          : ''}
        <span style="font-size:11px;color:var(--muted);">${area.departamentos.length} depto${area.departamentos.length !== 1 ? 's' : ''}</span>
        <div class="area-actions" onclick="event.stopPropagation()">
          <button class="btn btn-sm btn-outline" title="Editar nombre"
                  onclick="abrirModalEditarArea('${area.id}')" style="padding:2px 6px;">${ICON_EDIT}</button>
          <button class="btn btn-sm btn-outline" title="Agregar departamento"
                  onclick="abrirModalDepto('${area.id}')" style="padding:2px 6px;">${ICON_PLUS}</button>
          <button class="btn btn-sm btn-outline" title="Eliminar área"
                  onclick="confirmarEliminarArea('${area.id}', '${escAttr(area.label)}')" style="padding:2px 6px;">${ICON_TRASH}</button>
        </div>
      </div>
      <div class="deptos-body">
        ${area.departamentos.length === 0
          ? '<div class="depto-empty">Sin departamentos — usa + para agregar.</div>'
          : area.departamentos.map(d => `
            <div class="depto-row">
              <span class="depto-codigo">${d.codigo ? escHtml(d.codigo) : '—'}</span>
              <span class="depto-nombre">${escHtml(d.nombre)}</span>
              <div class="depto-actions">
                <button class="btn btn-sm btn-outline" title="Editar"
                        onclick="abrirModalEditarDepto('${area.id}', '${escAttr(d.nombre)}', '${escAttr(d.codigo || '')}')"
                        style="padding:2px 6px;">${ICON_EDIT}</button>
                <button class="btn btn-sm btn-outline" title="Eliminar"
                        onclick="confirmarEliminarDepto('${area.id}', '${escAttr(d.nombre)}')"
                        style="padding:2px 6px;">${ICON_TRASH}</button>
              </div>
            </div>`).join('')}
      </div>
    </div>`).join('');
}

function toggleArea(id) {
  document.getElementById(`area-card-${id}`)?.classList.toggle('open');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escAttr(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function abrirModalArea() {
  _editandoAreaId = null;
  document.getElementById('modal-area-titulo').textContent = 'Nueva área';
  document.getElementById('area-id').value = '';
  document.getElementById('area-label').value = '';
  document.getElementById('btn-guardar-area').textContent = 'Crear área';
  UI.abrirModal('modal-area');
  setTimeout(() => document.getElementById('area-label').focus(), 80);
}

function abrirModalEditarArea(id) {
  const area = _areas.find(a => a.id === id);
  if (!area) return;
  _editandoAreaId = id;
  document.getElementById('modal-area-titulo').textContent = 'Editar área';
  document.getElementById('area-id').value = area.id;
  document.getElementById('area-label').value = area.label || area.id;
  document.getElementById('btn-guardar-area').textContent = 'Guardar cambios';
  UI.abrirModal('modal-area');
  setTimeout(() => document.getElementById('area-label').focus(), 80);
}

async function submitArea(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-guardar-area');
  btn.disabled = true;
  try {
    const label = document.getElementById('area-label').value.trim().toUpperCase();
    if (!label) { Toast.error('El nombre del área es requerido'); return; }

    if (_editandoAreaId) {
      // EncodeURIComponent por si el id tiene acentos o espacios
      await Api.put(`/areas/${encodeURIComponent(_editandoAreaId)}`, { label });
      Toast.success('Área actualizada (ID = nombre visible)');
    } else {
      // Backend fuerza id = label
      await Api.post('/areas', { id: label, label });
      Toast.success('Área creada');
    }
    UI.cerrarModal('modal-area');
    await cargarAreas();
    await cargarHistorial();
  } catch (err) {
    Toast.error(err.mensaje || 'Error al guardar el área');
  } finally {
    btn.disabled = false;
  }
}

async function confirmarEliminarArea(id, label) {
  if (!confirm(`¿Eliminar el área "${label}" y todos sus departamentos?\n\nLos requerimientos existentes conservan su valor.`)) return;
  try {
    const res = await Api.delete(`/areas/${encodeURIComponent(id)}`);
    const extra = res.requerimientos_historicos
      ? `\n${res.requerimientos_historicos} requerimiento(s) históricos conservan esta área.`
      : '';
    Toast.success('Área eliminada' + (extra ? ' (ver historial)' : ''));
    await cargarAreas();
    await cargarHistorial();
  } catch (err) {
    Toast.error(err.mensaje || 'Error al eliminar el área');
  }
}

function abrirModalDepto(areaId) {
  _editandoDeptoArea = areaId;
  _editandoDeptoNombre = null;
  const area = _areas.find(a => a.id === areaId);
  document.getElementById('modal-depto-titulo').textContent =
    `Nuevo departamento — ${area ? area.label : areaId}`;
  document.getElementById('depto-nombre').value = '';
  document.getElementById('depto-codigo').value = '';
  document.getElementById('btn-guardar-depto').textContent = 'Agregar';
  UI.abrirModal('modal-depto');
  setTimeout(() => document.getElementById('depto-nombre').focus(), 80);
}

function abrirModalEditarDepto(areaId, nombreActual, codigoActual) {
  _editandoDeptoArea = areaId;
  _editandoDeptoNombre = nombreActual;
  const area = _areas.find(a => a.id === areaId);
  document.getElementById('modal-depto-titulo').textContent =
    `Editar departamento — ${area ? area.label : areaId}`;
  document.getElementById('depto-nombre').value = nombreActual;
  document.getElementById('depto-codigo').value = codigoActual || '';
  document.getElementById('btn-guardar-depto').textContent = 'Guardar cambios';
  UI.abrirModal('modal-depto');
  setTimeout(() => document.getElementById('depto-nombre').focus(), 80);
}

async function submitDepto(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-guardar-depto');
  const nombre = document.getElementById('depto-nombre').value.trim().toUpperCase();
  const codigo = document.getElementById('depto-codigo').value.trim() || null;
  btn.disabled = true;
  try {
    const body = { nombre, codigo };
    const areaEnc = encodeURIComponent(_editandoDeptoArea);
    if (_editandoDeptoNombre) {
      const encoded = encodeURIComponent(_editandoDeptoNombre);
      const res = await Api.put(`/areas/${areaEnc}/departamentos/${encoded}`, body);
      if (res.requerimientos_historicos > 0) {
        Toast.success(`Actualizado · ${res.requerimientos_historicos} req. actualizados con el nuevo nombre`);
      } else {
        Toast.success('Departamento actualizado');
      }
    } else {
      await Api.post(`/areas/${areaEnc}/departamentos`, body);
      Toast.success('Departamento agregado');
    }
    UI.cerrarModal('modal-depto');
    await cargarAreas();
    await cargarHistorial();
    const card = document.getElementById(`area-card-${_editandoDeptoArea}`);
    if (card && !card.classList.contains('open')) card.classList.add('open');
  } catch (err) {
    Toast.error(err.mensaje || 'Error al guardar departamento');
  } finally {
    btn.disabled = false;
  }
}

async function confirmarEliminarDepto(areaId, nombre) {
  let msg = `¿Eliminar el departamento "${nombre}"?\n\nLos requerimientos existentes conservan su valor.`;
  try {
    const encoded = encodeURIComponent(nombre);
    const areaEnc = encodeURIComponent(areaId);
    const uso = await Api.get(`/areas/${areaEnc}/departamentos/${encoded}/uso`);
    if (uso.requerimientos > 0) {
      msg = `¿Eliminar "${nombre}"?\n\n${uso.requerimientos} requerimiento(s) históricos usan este departamento y conservarán el valor.`;
    }
  } catch { /* continuar con mensaje base */ }
  if (!confirm(msg)) return;
  try {
    await Api.delete(`/areas/${encodeURIComponent(areaId)}/departamentos/${encodeURIComponent(nombre)}`);
    Toast.success('Departamento eliminado');
    await cargarAreas();
    await cargarHistorial();
    const card = document.getElementById(`area-card-${areaId}`);
    if (card && !card.classList.contains('open')) card.classList.add('open');
  } catch (err) {
    Toast.error(err.mensaje || 'Error al eliminar departamento');
  }
}

window.abrirModalArea = abrirModalArea;
window.abrirModalEditarArea = abrirModalEditarArea;
window.submitArea = submitArea;
window.confirmarEliminarArea = confirmarEliminarArea;
window.abrirModalDepto = abrirModalDepto;
window.abrirModalEditarDepto = abrirModalEditarDepto;
window.submitDepto = submitDepto;
window.confirmarEliminarDepto = confirmarEliminarDepto;
window.toggleArea = toggleArea;

cargarAreas();
cargarHistorial();