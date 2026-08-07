/* ============================================================
   app.js — núcleo del frontend
   Contiene: API client, auth, toast, utilidades de UI
   ============================================================ */

const API_BASE = `${window.location.protocol}//${window.location.host}/api`;

// ─── AUTH ─────────────────────────────────────────────────────────────────────
const Auth = {
  /** Rol legacy contabilidad → compras */
  normalizarRol(rol) {
    if (rol === 'contabilidad') return 'compras';
    return rol;
  },
  etiquetaRol(rol) {
    const r = this.normalizarRol(rol);
    if (r === 'compras') return 'Compras';
    if (r === 'admin') return 'Admin';
    if (r === 'solicitante') return 'Solicitante';
    return r || '—';
  },
  getToken()  { return localStorage.getItem('oc_token'); },
  getUsuario(){
    const u = JSON.parse(localStorage.getItem('oc_usuario') || 'null');
    if (u && u.rol) u.rol = this.normalizarRol(u.rol);
    return u;
  },
  guardar(token, usuario) {
    const u = usuario ? { ...usuario, rol: this.normalizarRol(usuario.rol) } : usuario;
    localStorage.setItem('oc_token',   token);
    localStorage.setItem('oc_usuario', JSON.stringify(u));
  },
  cerrar() {
    localStorage.removeItem('oc_token');
    localStorage.removeItem('oc_usuario');
    window.location.href = '/login.html';
  },
  requiereAuth() {
    if (!this.getToken()) window.location.href = '/login.html';
  },
  puedeHacer(roles) {
    const u = this.getUsuario();
    if (!u) return false;
    const rol = this.normalizarRol(u.rol);
    return roles.some((r) => this.normalizarRol(r) === rol);
  },
};

// ─── API CLIENT ───────────────────────────────────────────────────────────────
const Api = {
  async _fetch(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token   = Auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && !path.includes('/auth/login')) {
      Auth.cerrar();
      return;
    }

    let data = null;
    try {
      data = res.status === 204 ? null : await res.json();
    } catch (e) {
      // If not JSON (e.g. 403 plain text from middleware), use text
      try {
        const text = await res.text();
        data = { message: text || 'Error' };
      } catch (_) {
        data = { message: 'Error desconocido' };
      }
    }
    if (!res.ok) {
      const errorObj = {
        status: res.status,
        mensaje: data?.mensaje || data?.message || 'Error desconocido',
      };
      if (data?.errores) errorObj.errores = data.errores;
      if (data) errorObj.data = data;
      throw errorObj;
    }
    return data;
  },

  get(path)          { return this._fetch('GET',    path); },
  post(path, body)   { return this._fetch('POST',   path, body); },
  put(path, body)    { return this._fetch('PUT',    path, body); },
  patch(path, body)  { return this._fetch('PATCH',  path, body); },
  delete(path)       { return this._fetch('DELETE', path); },

  async uploadForm(path, fields = {}) {
    const token = Auth.getToken();
    const fd = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (value != null) fd.append(key, value);
    });

    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });

    if (res.status === 401) {
      Auth.cerrar();
      return;
    }

    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = { mensaje: 'Error al subir archivo' };
    }

    if (!res.ok) {
      throw {
        status: res.status,
        mensaje: data?.mensaje || data?.message || 'Error al subir archivo',
      };
    }
    return data;
  },

  async uploadFile(path, file, fieldName = 'file') {
    const token = Auth.getToken();
    const fd = new FormData();
    fd.append(fieldName, file);

    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });

    if (res.status === 401) {
      Auth.cerrar();
      return;
    }

    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = { mensaje: 'Error al procesar la respuesta del servidor' };
    }

    if (!res.ok) {
      throw {
        status: res.status,
        mensaje: data?.mensaje || data?.message || 'Error al subir el archivo',
      };
    }
    return data;
  },
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
const Toast = {
  _container: null,
  _getContainer() {
    if (!this._container) {
      this._container = document.getElementById('toast-container');
      if (!this._container) {
        this._container = document.createElement('div');
        this._container.id = 'toast-container';
        document.body.appendChild(this._container);
      }
    }
    return this._container;
  },
  show(mensaje, tipo = 'info', duracion = 4000) {
    const icons = { success: '✔', error: '✘', info: 'ℹ', warning: '⚠' };
    const t = document.createElement('div');
    t.className = `toast ${tipo}`;
    t.innerHTML = `<span>${icons[tipo] || 'ℹ'}</span>
                   <span class="toast-msg">${mensaje}</span>
                   <button class="toast-close" onclick="this.closest('.toast').remove()">×</button>`;
    this._getContainer().appendChild(t);
    setTimeout(() => t.remove(), duracion);
  },
  success(msg, duracion) { this.show(msg, 'success', duracion || 4000); },
  error(msg, duracion)   { this.show(msg, 'error', duracion || 6000); },
  info(msg, duracion)    { this.show(msg, 'info', duracion || 4000); },
  warning(msg, duracion) { this.show(msg, 'warning', duracion || 6000); },
};

// ─── UTILIDADES DE UI ─────────────────────────────────────────────────────────
const UI = {
  esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // Badge de estado con color y etiqueta legible
  badge(estado) {
    const labels = {
      borrador: 'Borrador',
      en_revision: 'En revisión',
      recibido: 'Recibido',
      incompleto: 'Incompleto',
      aprobado: 'Aprobado',
      rechazado: 'Rechazado',
      cerrado: 'Cerrado',
      generada: 'Generada',
      distribuida: 'Distribuida',
      en_proceso: 'En proceso',
      recibida: 'Recibida',
      cancelada: 'Cancelada',
    };
    const e = estado || '';
    const texto = labels[e] || String(e).replace(/_/g, ' ');
    return `<span class="badge badge-${e}">${texto}</span>`;
  },

  // Formatea fecha corta
  fecha(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  },

  labelProveedor(proveedor) {
    if (!proveedor) return '—';
    const nombre = proveedor.nombre || proveedor.proveedor_nombre || '';
    const num = proveedor.num_proveedor || proveedor.proveedor_num;
    if (!num && !nombre) return '—';
    return num ? `${num} — ${nombre}` : nombre;
  },

  urlArchivo(ruta) {
    if (!ruta) return null;
    if (/^https?:\/\//i.test(ruta)) return ruta;
    const base = API_BASE.replace(/\/api\/?$/, '');
    return `${base}${ruta.startsWith('/') ? ruta : `/${ruta}`}`;
  },

  referenciaItemHtml(item, compact = false) {
    if (!item?.referencia_url) return '';

    const estilo = compact
      ? 'font-size:10px; margin-top:2px;'
      : 'font-size:11px; margin-top:3px;';

    if (item.referencia_tipo === 'link') {
      const url = item.referencia_url;
      return `<div style="${estilo}">
        <a href="${url}" target="_blank" rel="noopener" style="color:#185FA5;">🔗 Ver referencia del producto</a>
      </div>`;
    }

    const href = UI.urlArchivo(item.referencia_url);
    const nombre = item.referencia_nombre || 'Documento de referencia';
    return `<div style="${estilo}">
      <a href="${href}" target="_blank" rel="noopener" style="color:#185FA5;">📎 ${nombre}</a>
    </div>`;
  },

  // Muestra/oculta spinner dentro de un contenedor
  spinner(contenedor) {
    contenedor.innerHTML = '<div class="spinner"></div>';
  },

  // Tabla vacía
  empty(contenedor, mensaje = 'Sin registros') {
    contenedor.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"
             viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0
             002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0
             012-2h2a2 2 0 012 2"/></svg>
        <p>${mensaje}</p>
      </div>`;
  },

  // Scroll vertical a restaurar tras cambiar de página (lo setea el click del paginador)
  _pagScrollY: null,

  // Renderiza paginación (si el contenedor es .pagination-bar queda fijo al pie)
  paginacion(contenedor, total, pagina, limite, onCambio) {
    const totalPags = Math.ceil(total / limite);
    if (totalPags <= 1) { contenedor.innerHTML = ''; return; }

    let html = `<div class="pagination">
      <button type="button" data-pag="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''}>‹</button>`;

    for (let i = 1; i <= totalPags; i++) {
      if (i === 1 || i === totalPags || Math.abs(i - pagina) <= 1) {
        html += `<button type="button" class="${i === pagina ? 'active' : ''}" data-pag="${i}">${i}</button>`;
      } else if (Math.abs(i - pagina) === 2) {
        html += `<span>…</span>`;
      }
    }

    html += `<button type="button" data-pag="${pagina + 1}" ${pagina === totalPags ? 'disabled' : ''}>›</button>
      <span class="pag-info">Pág. ${pagina} de ${totalPags} · ${total} registros</span></div>`;
    contenedor.innerHTML = html;

    contenedor.querySelectorAll('button[data-pag]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const p = Number(btn.dataset.pag);
        if (!Number.isFinite(p) || p < 1) return;
        // Guardar scroll ANTES de que el spinner colapse la tabla
        UI._pagScrollY = window.scrollY;
        onCambio(p);
      });
    });

    // Restaurar scroll tras re-render (doble rAF: espera layout de la tabla)
    if (UI._pagScrollY != null) {
      const y = UI._pagScrollY;
      UI._pagScrollY = null;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, y);
        });
      });
    }
  },

  // Abre modal
  abrirModal(id) {
    document.getElementById(id)?.classList.add('show');
  },

  // Cierra modal
  cerrarModal(id) {
    document.getElementById(id)?.classList.remove('show');
    // Limpiar formularios dentro
    document.getElementById(id)?.querySelectorAll('form').forEach(f => f.reset());
  },
};

// ─── SIDEBAR: marcar enlace activo ────────────────────────────────────────────
function marcarNavActivo() {
  const pagina = window.location.pathname.split('/').pop();
  document.querySelectorAll('#sidebar nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === pagina);
  });
}

// ─── TOPBAR: info del usuario + campana de notificaciones ───────────────────
function renderTopbar(titulo) {
  const u = Auth.getUsuario();
  const topbar = document.getElementById('topbar');
  if (!topbar || !u) return;
  topbar.innerHTML = `
    <span class="topbar-title">${titulo}</span>
    <div class="topbar-right">
      <div class="notif-wrap" id="notif-wrap">
        <button type="button" class="notif-btn" id="notif-btn" title="Notificaciones"
                onclick="toggleNotificaciones(event)" aria-expanded="false">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          <span class="notif-badge" id="notif-badge" style="display:none">0</span>
        </button>
        <div class="notif-panel" id="notif-panel" style="display:none" role="menu">
          <div class="notif-panel-head">
            <strong id="notif-panel-title">Bandeja</strong>
            <a href="#" id="notif-ver-todos" class="text-sm" style="color:var(--primary)">Ver todos</a>
          </div>
          <div class="notif-panel-body" id="notif-panel-body">
            <p class="text-muted text-sm" style="padding:12px;margin:0">Cargando…</p>
          </div>
        </div>
      </div>
      <span class="badge-rol">${Auth.etiquetaRol(u.rol)}</span>
      <span class="text-muted text-sm">${String(u.nombre || '').replace(/</g, '&lt;')}</span>
      <button class="btn-logout" onclick="Auth.cerrar()">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"
             viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3
             3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
        Salir
      </button>
    </div>`;
  initNotificaciones();
}

// ─── Notificaciones (campana) ─────────────────────────────────────────────────
let _notifTimer = null;
let _notifData = null;

function notifStorageKey() {
  const u = Auth.getUsuario();
  return u ? `oc_notif_seen_${u.id}` : 'oc_notif_seen';
}

function getNotifSeenIds() {
  try {
    const raw = localStorage.getItem(notifStorageKey());
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function markNotifSeen(ids) {
  const seen = getNotifSeenIds();
  (ids || []).forEach((id) => seen.add(String(id)));
  // Conservar solo últimos 200
  const list = [...seen].slice(-200);
  localStorage.setItem(notifStorageKey(), JSON.stringify(list));
}

window.toggleNotificaciones = function (ev) {
  if (ev) ev.stopPropagation();
  const panel = document.getElementById('notif-panel');
  const btn = document.getElementById('notif-btn');
  if (!panel) return;
  const open = panel.style.display !== 'none';
  if (open) {
    panel.style.display = 'none';
    if (btn) btn.setAttribute('aria-expanded', 'false');
    return;
  }
  panel.style.display = 'block';
  if (btn) btn.setAttribute('aria-expanded', 'true');
  cargarNotificaciones(true);
  // Marcar como vistos los que se muestran
  if (_notifData?.items?.length) {
    markNotifSeen(_notifData.items.map((i) => i.id));
    actualizarBadgeNotif(_notifData);
  }
};

async function cargarNotificaciones(renderPanel = false) {
  const badge = document.getElementById('notif-badge');
  const body = document.getElementById('notif-panel-body');
  try {
    const data = await Api.get('/notificaciones/bandeja?limite=15');
    _notifData = data;
    actualizarBadgeNotif(data);
    if (renderPanel && body) renderPanelNotif(data);
    const verTodos = document.getElementById('notif-ver-todos');
    if (verTodos) {
      // Preferir Dashboard bandeja; fallback al listado de la cola
      verTodos.href = data.link_dashboard || data.link_todos || 'dashboard.html#bandeja';
      verTodos.textContent = 'Abrir bandeja';
      verTodos.onclick = null;
    }
    const title = document.getElementById('notif-panel-title');
    if (title) {
      const n = data.contadores?.por_recibir ?? data.total;
      title.textContent = data.tipo === 'compras'
        ? `Bandeja Compras${n != null ? ` · ${n} por recibir` : ''}`
        : 'Mis pendientes';
    }
  } catch (err) {
    if (badge) badge.style.display = 'none';
    if (renderPanel && body) {
      body.innerHTML = '<p class="text-muted text-sm" style="padding:12px;margin:0">No se pudieron cargar</p>';
    }
  }
}

function actualizarBadgeNotif(data) {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  const total = Number(data?.total) || 0;
  const seen = getNotifSeenIds();
  const nuevos = (data?.items || []).filter((i) => !seen.has(String(i.id))).length;
  // Preferir “nuevos no vistos”; si todos vistos, mostrar total de la bandeja si > 0
  const n = nuevos > 0 ? nuevos : (total > 0 && data?.tipo === 'compras' ? total : nuevos);
  if (n > 0) {
    badge.style.display = '';
    badge.textContent = n > 99 ? '99+' : String(n);
  } else if (total > 0 && data?.tipo === 'compras') {
    badge.style.display = '';
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.classList.add('notif-badge-muted');
  } else {
    badge.style.display = 'none';
    badge.classList.remove('notif-badge-muted');
  }
}

function renderPanelNotif(data) {
  const body = document.getElementById('notif-panel-body');
  if (!body) return;
  const items = data.items || [];
  if (!items.length) {
    body.innerHTML = `<p class="text-muted text-sm" style="padding:14px;margin:0;text-align:center">
      ${data.tipo === 'compras' ? 'No hay requerimientos en revisión' : 'Sin pendientes'}
    </p>`;
    return;
  }
  const seen = getNotifSeenIds();
  const esc = (s) => (typeof UI !== 'undefined' && UI.esc ? UI.esc(s) : String(s || '').replace(/</g, '&lt;'));
  body.innerHTML = items.map((it) => {
    const isNew = !seen.has(String(it.id));
    const label = it.consecutivo || `REQ #${it.id}`;
    const sub = [
      it.solicitante_nombre,
      it.tipo,
      it.estado === 'incompleto' ? 'Incompleto'
        : it.estado === 'recibido' ? 'Recibido'
        : it.estado === 'en_revision' ? 'Por recibir' : null,
    ].filter(Boolean).join(' · ');
    const detalle = (it.titulo_solicitud || '').slice(0, 80);
    return `
      <a class="notif-item${isNew ? ' notif-item-new' : ''}" href="requerimientos.html?id=${it.id}">
        <div class="notif-item-top">
          <strong>${esc(label)}</strong>
          ${isNew ? '<span class="notif-dot-new">Nuevo</span>' : ''}
        </div>
        <div class="notif-item-sub">${esc(sub)}</div>
        ${detalle ? `<div class="notif-item-detail">${esc(detalle)}</div>` : ''}
      </a>`;
  }).join('');
}

function initNotificaciones() {
  if (!document.getElementById('notif-btn')) return;
  cargarNotificaciones(false);
  if (_notifTimer) clearInterval(_notifTimer);
  _notifTimer = setInterval(() => cargarNotificaciones(false), 60000);

  // Cerrar al clic fuera
  if (!document.body.dataset.notifOutside) {
    document.body.dataset.notifOutside = '1';
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('notif-wrap');
      const panel = document.getElementById('notif-panel');
      if (!wrap || !panel || panel.style.display === 'none') return;
      if (!wrap.contains(e.target)) {
        panel.style.display = 'none';
        const btn = document.getElementById('notif-btn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

// ─── SIDEBAR HTML (compartido en todas las páginas) ───────────────────────────
function renderSidebar() {
  const u = Auth.getUsuario();
  if (!u) return;

  // Menús visibles por rol
  const esCompras = ['compras','admin'].includes(u.rol);
  // Nota: "Órdenes de Compra" ahora es visible para TODOS (incluyendo solicitantes),
  // pero el backend limita a los solicitantes para que solo vean las OCs de sus propios requerimientos.

  document.getElementById('sidebar').innerHTML = `
    <div class="sidebar-brand">
      <img class="parkdale-logo parkdale-logo-sidebar" src="img/topLogoParkdale.png" alt="Parkdale">
      Sistema OC
    </div>
    <nav>
      <span class="nav-section">General</span>
      <a href="dashboard.html">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
             viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14"
             y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
             <rect x="3" y="14" width="7" height="7"/></svg>
        Dashboard
      </a>

      <span class="nav-section">Operaciones</span>
      <a href="requerimientos.html">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
             viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2
             0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2"/></svg>
        Requerimientos
      </a>
      <!-- Orden menú: REQ → OC → Catálogo → Proveedores -->
      <a href="ordenes.html">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
             viewBox="0 0 24 24"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5
             9z"/></svg>
        Órdenes de Compra
      </a>
      <a href="catalogo.html">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
             viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
        Catálogo
      </a>
      ${esCompras ? `
      <a href="proveedores.html">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
             viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10
             0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0
             -.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/></svg>
        Proveedores
      </a>` : ''}

      ${esCompras ? `
      <span class="nav-section">Administración</span>
      <a href="usuarios.html">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
             viewBox="0 0 24 24"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6
             0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197"/></svg>
        Usuarios
      </a>
      <a href="areas.html">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
             viewBox="0 0 24 24"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>
        Áreas y Departamentos
      </a>
      ${u.rol === 'admin' ? `
      <a href="configuracion.html">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
             viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 002.572 1.065c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
        Configuración SMTP
      </a>` : ''}` : ''}
    </nav>
    <div class="sidebar-footer">
      <strong>${u.nombre}</strong>
      ${u.email}
      <span class="app-version" id="app-version" title="Versión del servidor">…</span>
    </div>`;

  marcarNavActivo();
  cargarVersionApp();
}

/**
 * Lee /api/health y muestra la versión del servidor (fuente: backend/package.json).
 * Si el health falla, deja un guion para no romper la UI.
 */
async function cargarVersionApp() {
  const targets = document.querySelectorAll('#app-version, .app-version-login');
  if (!targets.length) return;
  try {
    const data = await Api.get('/health');
    const label = data?.version ? `v${data.version}` : '—';
    targets.forEach((el) => {
      el.textContent = label;
      if (data?.version) el.title = `Sistema OC v${data.version}`;
    });
  } catch {
    targets.forEach((el) => {
      el.textContent = '—';
      el.title = 'No se pudo obtener la versión';
    });
  }
}

// ─── UTILIDADES COMPARTIDAS ────────────────────────────────────────────────────
/**
 * Debounce para inputs (búsquedas, etc.)
 */
function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Maneja estado de carga en botones (deshabilita + cambia texto/HTML)
 */
function setButtonLoading(btn, isLoading, loadingText = 'Guardando…') {
  if (!btn) return;
  if (isLoading) {
    if (btn.dataset.originalHtml == null) {
      btn.dataset.originalHtml = btn.innerHTML;
    }
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = loadingText;
  } else {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (btn.dataset.originalHtml != null) {
      btn.innerHTML = btn.dataset.originalHtml;
    }
  }
}

/**
 * Event delegation simple y reutilizable
 */
function delegate(container, selector, eventType, handler) {
  if (!container) return;
  container.addEventListener(eventType, (e) => {
    const target = e.target.closest(selector);
    if (target && container.contains(target)) {
      handler(e, target);
    }
  });
}

/**
 * Confirmación simple usando el nativo (fácil de reemplazar después)
 */
function confirmAction(message, onConfirm) {
  if (window.confirm(message)) {
    onConfirm();
  }
}

// Exponer globalmente
window.Auth   = Auth;
window.Api    = Api;
window.Toast  = Toast;
window.UI     = UI;
window.renderSidebar = renderSidebar;
window.renderTopbar  = renderTopbar;
window.toggleNotificaciones = window.toggleNotificaciones;

// Nuevas utilidades expuestas
window.debounce = debounce;
window.setButtonLoading = setButtonLoading;
window.delegate = delegate;
window.confirmAction = confirmAction;

// ─── EXCEL / REPORTES (botones y descargas homologados) ───────────────────────
const ExcelUI = {
  /** Icono ↓ exportar (SVG inline, 13px) */
  iconExport:
    '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>' +
    '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' +
    '</svg>',

  /** Icono ↑ cargar (SVG inline, 13px) */
  iconImport:
    '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>' +
    '<polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>' +
    '</svg>',

  labelExport: 'Exportar Excel',
  labelImport: 'Cargar Excel',

  htmlExport() {
    return `${this.iconExport} ${this.labelExport}`;
  },
  htmlImport() {
    return `${this.iconImport} ${this.labelImport}`;
  },

  /**
   * Descarga un blob Excel autenticado.
   * @param {string} path ruta API (con query)
   * @param {object} [opts]
   * @param {HTMLElement} [opts.btn]
   * @param {string} [opts.filename]
   * @param {string} [opts.successMsg]
   * @param {string} [opts.loadingText]
   */
  async descargar(path, opts = {}) {
    const {
      btn = null,
      filename = null,
      successMsg = 'Excel descargado',
      loadingText = 'Generando…',
    } = opts;

    const token = Auth.getToken();
    if (!token) {
      Toast.error('Debes iniciar sesión');
      return false;
    }

    if (btn) setButtonLoading(btn, true, loadingText);
    try {
      const res = await fetch(API_BASE + path, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.mensaje || 'Error al generar el Excel');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      let name = filename || `export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const disposition = res.headers.get('Content-Disposition');
      if (disposition) {
        const match = disposition.match(/filename="?([^";]+)"?/i);
        if (match) name = match[1].trim();
      }
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      Toast.success(successMsg);
      return true;
    } catch (err) {
      Toast.error(err.message || 'Error al descargar el Excel');
      return false;
    } finally {
      if (btn) setButtonLoading(btn, false);
    }
  },
};

/** Reportes de operación en layout BASE GRAL */
const Reportes = {
  _exportacionPendiente: null,

  solicitarPeriodoExportacion({ titulo = 'Exportar reporte', btn, alConfirmar }) {
    const modalId = 'modal-periodo-exportacion';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-box" style="max-width:420px;">
          <div class="modal-header">
            <h3 class="modal-title" id="periodo-exportacion-titulo"></h3>
            <button type="button" class="modal-close" aria-label="Cerrar">×</button>
          </div>
          <div class="modal-body">
            <p style="margin:0 0 16px;color:#475569;font-size:13px;line-height:1.5;">Selecciona el periodo que deseas incluir en el archivo Excel.</p>
            <label style="display:flex;align-items:flex-start;gap:9px;padding:10px 12px;border:1px solid var(--border);border-radius:7px;cursor:pointer;margin-bottom:8px;">
              <input type="radio" name="periodo-exportacion" value="anio" checked style="margin-top:2px;">
              <span><strong style="display:block;font-size:13px;">Un año particular</strong><small class="text-muted">Exporta únicamente los registros del año seleccionado.</small></span>
            </label>
            <div id="periodo-exportacion-anio-wrap" class="form-group" style="margin:0 0 12px 30px;">
              <label class="form-label" for="periodo-exportacion-anio">Año</label>
              <input type="number" id="periodo-exportacion-anio" class="form-control" min="2000" step="1" required>
            </div>
            <label style="display:flex;align-items:flex-start;gap:9px;padding:10px 12px;border:1px solid var(--border);border-radius:7px;cursor:pointer;">
              <input type="radio" name="periodo-exportacion" value="completo" style="margin-top:2px;">
              <span><strong style="display:block;font-size:13px;">Reporte completo</strong><small class="text-muted">Exporta todos los registros disponibles.</small></span>
            </label>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" data-accion="cancelar">Cancelar</button>
            <button type="button" class="btn btn-primary" data-accion="exportar">Exportar Excel</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      const actualizarEstado = () => {
        const esAnio = modal.querySelector('input[name="periodo-exportacion"]:checked')?.value === 'anio';
        modal.querySelector('#periodo-exportacion-anio').disabled = !esAnio;
        modal.querySelector('#periodo-exportacion-anio-wrap').style.opacity = esAnio ? '1' : '.5';
      };
      modal.querySelectorAll('input[name="periodo-exportacion"]').forEach((input) => input.addEventListener('change', actualizarEstado));
      modal.querySelector('.modal-close').addEventListener('click', () => this.cerrarPeriodoExportacion());
      modal.querySelector('[data-accion="cancelar"]').addEventListener('click', () => this.cerrarPeriodoExportacion());
      modal.querySelector('[data-accion="exportar"]').addEventListener('click', () => this.confirmarPeriodoExportacion());
      modal.addEventListener('click', (event) => { if (event.target === modal) this.cerrarPeriodoExportacion(); });
    }
    modal.querySelector('#periodo-exportacion-titulo').textContent = titulo;
    modal.querySelector('input[value="anio"]').checked = true;
    modal.querySelector('#periodo-exportacion-anio').value = new Date().getFullYear();
    modal.querySelector('#periodo-exportacion-anio').disabled = false;
    modal.querySelector('#periodo-exportacion-anio-wrap').style.opacity = '1';
    this._exportacionPendiente = { btn, alConfirmar };
    modal.classList.add('show');
  },

  cerrarPeriodoExportacion() {
    document.getElementById('modal-periodo-exportacion')?.classList.remove('show');
    this._exportacionPendiente = null;
  },

  async confirmarPeriodoExportacion() {
    const pendiente = this._exportacionPendiente;
    const modal = document.getElementById('modal-periodo-exportacion');
    if (!pendiente || !modal) return;
    const modo = modal.querySelector('input[name="periodo-exportacion"]:checked')?.value || 'anio';
    const anio = Number.parseInt(modal.querySelector('#periodo-exportacion-anio')?.value, 10);
    if (modo === 'anio' && (!Number.isInteger(anio) || anio < 2000 || anio > new Date().getFullYear() + 1)) {
      Toast.error('Ingresa un año válido.');
      return;
    }
    modal.classList.remove('show');
    this._exportacionPendiente = null;
    await pendiente.alConfirmar({ modo, anio }, pendiente.btn);
  },

  /** Dashboard: BASE GRAL del año seleccionado */
  async descargarBaseGral(anio, btn) {
    const year = parseInt(anio) || new Date().getFullYear();
    return ExcelUI.descargar(`/reportes/status-pos-hilos?anio=${year}`, {
      btn,
      successMsg: `BASE GRAL ${year} descargado (REQ + OC)`,
      loadingText: 'Generando…',
    });
  },

  /** Alias histórico (UI anterior STATUS POS) */
  async descargarStatusPOS(anio, btn) {
    return this.descargarBaseGral(anio, btn);
  },
};

window.ExcelUI = ExcelUI;
window.Reportes = Reportes;
