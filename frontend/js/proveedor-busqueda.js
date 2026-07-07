/**
 * Búsqueda de proveedores por código (num_proveedor) o nombre.
 * Usado en catálogo, nuevo REQ y vista por proveedor.
 */
const ProveedorBusqueda = {
  _cache: null,

  async cargar(force = false) {
    if (this._cache && !force) return this._cache;
    try {
      const data = await Api.get('/proveedores?activos=true');
      this._cache = Array.isArray(data) ? data : [];
    } catch {
      this._cache = [];
    }
    return this._cache;
  },

  getLista() {
    return this._cache || [];
  },

  coincide(proveedor, texto) {
    const q = String(texto || '').trim().toLowerCase();
    if (!q) return true;
    const num = String(proveedor.num_proveedor || proveedor.proveedor_num || '').toLowerCase();
    const nom = String(proveedor.nombre || proveedor.proveedor_nombre || '').toLowerCase();
    const label = UI.labelProveedor(proveedor).toLowerCase();
    return num.includes(q) || nom.includes(q) || label.includes(q);
  },

  buscar(texto, limite = 25) {
    const q = String(texto || '').trim();
    if (!q) return [];
    return this.getLista().filter((p) => this.coincide(p, q)).slice(0, limite);
  },

  obtenerPorId(id) {
    if (id == null || id === '') return null;
    return this.getLista().find((p) => String(p.id) === String(id)) || null;
  },

  resolver(inputEl, hiddenEl) {
    if (!inputEl) return null;

    const texto = inputEl.value.trim();
    if (!texto) {
      if (hiddenEl) hiddenEl.value = '';
      return null;
    }

    const lista = this.getLista();
    const lower = texto.toLowerCase();

    const porNumExacto = lista.find(
      (p) => String(p.num_proveedor || '').toLowerCase() === lower
    );
    if (porNumExacto) {
      if (hiddenEl) hiddenEl.value = porNumExacto.id;
      inputEl.value = UI.labelProveedor(porNumExacto);
      return porNumExacto.id;
    }

    const porLabelExacto = lista.find(
      (p) => UI.labelProveedor(p).toLowerCase() === lower
    );
    if (porLabelExacto) {
      if (hiddenEl) hiddenEl.value = porLabelExacto.id;
      return porLabelExacto.id;
    }

    const parciales = lista.filter((p) => this.coincide(p, texto));
    if (parciales.length === 1) {
      if (hiddenEl) hiddenEl.value = parciales[0].id;
      inputEl.value = UI.labelProveedor(parciales[0]);
      return parciales[0].id;
    }

    if (hiddenEl) hiddenEl.value = '';
    return null;
  },

  establecer(inputEl, hiddenEl, proveedorId) {
    const p = this.obtenerPorId(proveedorId);
    if (hiddenEl) hiddenEl.value = proveedorId || '';
    if (inputEl) inputEl.value = p ? UI.labelProveedor(p) : '';
  },

  limpiar(inputEl, hiddenEl) {
    if (inputEl) {
      inputEl.value = '';
      inputEl.disabled = false;
      inputEl.title = '';
    }
    if (hiddenEl) hiddenEl.value = '';
  },

  bloquear(inputEl, hiddenEl, proveedorId) {
    this.establecer(inputEl, hiddenEl, proveedorId);
    if (inputEl) {
      inputEl.disabled = true;
      inputEl.title = 'Proveedor fijado al del primer ítem agregado';
    }
  },

  actualizarDatalist(datalistEl, texto) {
    if (!datalistEl) return;
    const matches = this.buscar(texto, 30);
    datalistEl.innerHTML = matches
      .map((p) => `<option value="${UI.esc(UI.labelProveedor(p))}"></option>`)
      .join('');
  },

  /**
   * @param {Object} cfg
   * @param {string} cfg.inputId
   * @param {string} [cfg.hiddenId]
   * @param {string} [cfg.datalistId]
   * @param {string} [cfg.placeholder]
   * @param {Function} [cfg.onChange] — (proveedorId|null) => void
   */
  async init(cfg) {
    const {
      inputId,
      hiddenId,
      datalistId,
      placeholder = 'Buscar proveedor (código o nombre)…',
      onChange,
    } = cfg;

    await this.cargar();

    const input = document.getElementById(inputId);
    if (!input) return null;

    const hidden = hiddenId ? document.getElementById(hiddenId) : null;
    let datalist = datalistId ? document.getElementById(datalistId) : null;

    input.placeholder = placeholder;
    if (datalistId) input.setAttribute('list', datalistId);

    if (!datalist && datalistId) {
      datalist = document.createElement('datalist');
      datalist.id = datalistId;
      input.insertAdjacentElement('afterend', datalist);
    }

    const notificar = () => {
      const id = this.resolver(input, hidden);
      if (onChange) onChange(id);
      return id;
    };

    if (!input.dataset.provSearchBound) {
      input.dataset.provSearchBound = '1';
      input.addEventListener('input', () => {
        this.actualizarDatalist(datalist, input.value);
        if (!input.value.trim() && hidden) {
          hidden.value = '';
          if (onChange) onChange(null);
        }
      });
      input.addEventListener('change', notificar);
      input.addEventListener('blur', () => setTimeout(notificar, 120));
    }

    this.actualizarDatalist(datalist, input.value);
    return { input, hidden, datalist };
  },
};

window.ProveedorBusqueda = ProveedorBusqueda;