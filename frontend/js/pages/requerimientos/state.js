// Estado compartido entre todos los módulos de requerimientos
var paginaActual = 1;
var requerimientoActual = null;
var estadoPendiente = null;
var editandoId = null;
var cotizacionEditandoId = null;
var cotizacionParaPdfId = null;
var datosCotizacionPendiente = null;
var _proveedoresCatalogoCache = null;

window.requerimientoItemsSeleccionados = [];
window.requerimientoItemsLibres = [];
