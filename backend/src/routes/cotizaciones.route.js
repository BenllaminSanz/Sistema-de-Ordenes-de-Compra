import express from 'express';
import * as cotizacionesController from '../controllers/cotizacionesController.js';

const router = express.Router();

// Rutas principales
router.get('/:requerimiento_id', cotizacionesController.listarCotizaciones);

router.get('/detalle/:id', cotizacionesController.obtenerCotizacion);

router.post('/', cotizacionesController.crearCotizacion);

router.put('/:id', cotizacionesController.actualizarCotizacion);

router.delete('/:id', cotizacionesController.eliminarCotizacion);

// Ruta específica para seleccionar una cotización
router.post('/:id/seleccionar', cotizacionesController.seleccionarCotizacion);

export default router;