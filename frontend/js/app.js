/* ============================================================
   app.js — núcleo del frontend
   Contiene: API client, auth, toast, utilidades de UI
   ============================================================ */

const API_BASE = `${window.location.protocol}//${window.location.host}/api`;

// ─── AUTH ─────────────────────────────────────────────────────────────────────
const Auth = {
  getToken()  { return localStorage.getItem('oc_token'); },
  getUsuario(){ return JSON.parse(localStorage.getItem('oc_usuario') || 'null'); },
  guardar(token, usuario) {
    localStorage.setItem('oc_token',   token);
    localStorage.setItem('oc_usuario', JSON.stringify(usuario));
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
    return u && roles.includes(u.rol);
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

  // Badge de estado con color
  badge(estado) {
    return `<span class="badge badge-${estado}">${estado.replace('_', ' ')}</span>`;
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

  // Renderiza paginación
  paginacion(contenedor, total, pagina, limite, onCambio) {
    const totalPags = Math.ceil(total / limite);
    if (totalPags <= 1) { contenedor.innerHTML = ''; return; }

    let html = `<div class="pagination">
      <button onclick="(${onCambio})(${pagina - 1})" ${pagina === 1 ? 'disabled' : ''}>‹</button>`;

    for (let i = 1; i <= totalPags; i++) {
      if (i === 1 || i === totalPags || Math.abs(i - pagina) <= 1) {
        html += `<button class="${i === pagina ? 'active' : ''}"
                  onclick="(${onCambio})(${i})">${i}</button>`;
      } else if (Math.abs(i - pagina) === 2) {
        html += `<span>…</span>`;
      }
    }

    html += `<button onclick="(${onCambio})(${pagina + 1})" ${pagina === totalPags ? 'disabled' : ''}>›</button>
      <span class="pag-info">${total} registros</span></div>`;
    contenedor.innerHTML = html;
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

// ─── TOPBAR: info del usuario ─────────────────────────────────────────────────
function renderTopbar(titulo) {
  const u = Auth.getUsuario();
  const topbar = document.getElementById('topbar');
  if (!topbar || !u) return;
  topbar.innerHTML = `
    <span class="topbar-title">${titulo}</span>
    <span class="badge-rol">${u.rol}</span>
    <span class="text-muted text-sm">${u.nombre}</span>
    <button class="btn-logout" onclick="Auth.cerrar()">
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"
           viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3
           3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
      Salir
    </button>`;
}

// ─── SIDEBAR HTML (compartido en todas las páginas) ───────────────────────────
function renderSidebar() {
  const u = Auth.getUsuario();
  if (!u) return;

  // Menús visibles por rol
  const esContabilidad = ['contabilidad','admin'].includes(u.rol);
  // Nota: "Órdenes de Compra" ahora es visible para TODOS (incluyendo solicitantes),
  // pero el backend limita a los solicitantes para que solo vean las OCs de sus propios requerimientos.

  document.getElementById('sidebar').innerHTML = `
    <div class="sidebar-brand">
      <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"
           viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0
           002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2
           2 0 012 2m-6 9l2 2 4-4"/></svg>
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
      <a href="catalogo.html">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
             viewBox="0 0 24 24"><path d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
        Catálogo
      </a>

      <!-- Órdenes de Compra es visible para todos los roles:
           - Admin y Contabilidad: ven todas las OCs.
           - Solicitantes: ven solo las OCs generadas a partir de sus propios requerimientos aprobados
             (el backend filtra automáticamente por solicitante_id del requerimiento). -->
      <a href="ordenes.html">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
             viewBox="0 0 24 24"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5
             9z"/></svg>
        Órdenes de Compra
      </a>

      ${esContabilidad ? `
      <a href="proveedores.html">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
             viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10
             0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0
             -.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/></svg>
        Proveedores
      </a>` : ''}

      ${esContabilidad ? `
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
    </div>`;

  marcarNavActivo();
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
 * Maneja estado de carga en botones (deshabilita + cambia texto)
 */
function setButtonLoading(btn, isLoading, loadingText = 'Guardando...') {
  if (!btn) return;
  if (isLoading) {
    if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = loadingText;
  } else {
    btn.disabled = false;
    if (btn.dataset.originalText) {
      btn.textContent = btn.dataset.originalText;
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

// Nuevas utilidades expuestas
window.debounce = debounce;
window.setButtonLoading = setButtonLoading;
window.delegate = delegate;
window.confirmAction = confirmAction;

// ─── REPORTES (descargas Excel protegidas) ───────────────────────────────────
const Reportes = {
  async descargarStatusPOS(anio) {
    try {
      const token = Auth.getToken();
      if (!token) {
        Toast.error('Debes iniciar sesión como contabilidad o admin');
        return;
      }

      const year = parseInt(anio) || new Date().getFullYear();
      const res = await fetch(API_BASE + `/reportes/status-pos-hilos?anio=${year}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.mensaje || 'Error al descargar el reporte');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const disposition = res.headers.get('Content-Disposition');
      let filename = `STATUS_${year}_POS_HILOS_${new Date().toISOString().slice(0, 10)}.xlsx`;
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }
      a.download = filename;

      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      Toast.success(`Reporte STATUS POS HILOS ${year} descargado`);
    } catch (err) {
      Toast.error(err.message || 'Error al descargar el reporte STATUS');
    }
  }
};

window.Reportes = Reportes;