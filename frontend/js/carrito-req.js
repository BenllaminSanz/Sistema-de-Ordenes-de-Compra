/**
 * Carrito compartido de ítems de catálogo para armar un requerimiento.
 * Persiste en sessionStorage entre catálogo ↔ requerimientos.
 */
const CARRITO_REQ_KEY = 'oc_carrito_req';

const CarritoReq = {
  _items: [],
  _listeners: [],

  load() {
    try {
      const raw = sessionStorage.getItem(CARRITO_REQ_KEY);
      const data = raw ? JSON.parse(raw) : null;
      this._items = Array.isArray(data?.items) ? data.items : [];
    } catch {
      this._items = [];
    }
    this.syncToWindow();
    return this._items;
  },

  save() {
    sessionStorage.setItem(CARRITO_REQ_KEY, JSON.stringify({ items: this._items }));
    this.syncToWindow();
    this._notify();
  },

  syncToWindow() {
    window.requerimientoItemsSeleccionados = this._items.map((i) => ({ ...i }));
  },

  getItems() {
    return this._items.map((i) => ({ ...i }));
  },

  count() {
    return this._items.length;
  },

  tiene(catalogoId) {
    return this._items.some((i) => i.catalogo_id === catalogoId);
  },

  getProveedorBloqueado() {
    if (!this._items.length) return null;
    const p = this._items[0];
    return {
      proveedor_id: p.proveedor_id ?? null,
      proveedor_nombre: p.proveedor_nombre || '',
      proveedor_num: p.proveedor_num || '',
    };
  },

  labelProveedor(item) {
    if (!item) return 'sin proveedor';
    if (typeof UI !== 'undefined' && UI.labelProveedor) {
      return UI.labelProveedor(item);
    }
    if (item.proveedor_num && item.proveedor_nombre) {
      return `${item.proveedor_num} — ${item.proveedor_nombre}`;
    }
    return item.proveedor_nombre || item.proveedor_num || 'sin proveedor';
  },

  puedeAgregar(item) {
    if (!this._items.length) return { ok: true };

    const provNuevo = item.proveedor_id != null && item.proveedor_id !== ''
      ? parseInt(item.proveedor_id, 10) : null;
    const bloqueado = this.getProveedorBloqueado();
    const provActual = bloqueado.proveedor_id != null
      ? parseInt(bloqueado.proveedor_id, 10) : null;

    if (provActual !== provNuevo) {
      return {
        ok: false,
        mensaje: `Solo puedes agregar ítems del mismo proveedor (${this.labelProveedor(bloqueado)}). Para pedir de otro proveedor, crea un requerimiento aparte.`,
      };
    }

    return { ok: true };
  },

  normalizarItem(item, cantidad) {
    return {
      catalogo_id: item.catalogo_id || item.id,
      codigo: item.codigo || '',
      descripcion: item.descripcion || '',
      costo_referencia: item.costo_referencia != null ? parseFloat(item.costo_referencia) : null,
      moneda: item.moneda || 'MXN',
      proveedor_id: item.proveedor_id != null && item.proveedor_id !== ''
        ? parseInt(item.proveedor_id, 10) : null,
      proveedor_nombre: item.proveedor_nombre || '',
      proveedor_num: item.proveedor_num || '',
      tipo: item.tipo || '',
      cantidad: Math.max(1, Math.round(parseFloat(cantidad) || 1)),
    };
  },

  agregar(item, cantidad = 1) {
    const id = item.catalogo_id || item.id;
    if (this.tiene(id)) {
      return { ok: false, mensaje: 'Este ítem ya está en tu solicitud' };
    }

    const validacion = this.puedeAgregar(item);
    if (!validacion.ok) return validacion;

    const eraVacio = this._items.length === 0;
    this._items.push(this.normalizarItem(item, cantidad));
    this.save();
    return { ok: true, primero: eraVacio };
  },

  actualizarCantidad(catalogoId, cantidad) {
    const item = this._items.find((i) => i.catalogo_id === catalogoId);
    if (!item) return;
    item.cantidad = Math.max(1, Math.round(parseFloat(cantidad) || 1));
    this.save();
  },

  eliminar(catalogoId) {
    this._items = this._items.filter((i) => i.catalogo_id !== catalogoId);
    this.save();
  },

  vaciar() {
    this._items = [];
    this.save();
  },

  reemplazar(items) {
    this._items = (items || []).map((i) => this.normalizarItem(i, i.cantidad));
    this.save();
  },

  onChange(fn) {
    this._listeners.push(fn);
  },

  _notify() {
    this._listeners.forEach((fn) => {
      try { fn(this.getItems()); } catch (e) { console.warn(e); }
    });
    if (typeof actualizarBarraCarritoReq === 'function') {
      actualizarBarraCarritoReq();
    }
  },
};

CarritoReq.load();

const CarritoReqUI = {
  mensajeProveedorUnico() {
    return 'Solo puedes agregar ítems del mismo proveedor en un requerimiento. Si necesitas otro proveedor, crea un requerimiento aparte.';
  },

  notificarAgregado(resultado) {
    if (!resultado?.ok) {
      Toast.error(resultado.mensaje);
      return false;
    }
    if (resultado.primero) {
      Toast.info(this.mensajeProveedorUnico(), 7000);
    } else {
      Toast.success('Ítem agregado a tu solicitud');
    }
    return true;
  },

  irACrearRequerimiento() {
    if (!CarritoReq.count()) {
      Toast.info('Agrega al menos un ítem del catálogo');
      return;
    }
    window.location.href = 'requerimientos.html?crear=1&desde=catalogo';
  },
};

window.CarritoReq = CarritoReq;
window.CarritoReqUI = CarritoReqUI;