// backend/src/routes/cotizaciones.route.js
import express from 'express';
const router = express.Router({ mergeParams: true });

import { listar, crear, actualizar, seleccionar, eliminar, getCotizacionesByRequerimiento, marcarCotizacionSeleccionada } from '../controllers/cotizacionesController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';

router.use(autenticar);

// Rutas existentes (mantenerlas)
router.get('/', listar);
router.post('/', autorizar(['contabilidad','admin']), crear);
router.put('/:id', autorizar(['contabilidad','admin']), actualizar);
router.patch('/:id/seleccionar', autorizar(['gerente','admin']), seleccionar);
router.delete('/:id', autorizar(['contabilidad','admin']), eliminar);

router.get('/requerimiento/:requerimientoId', getCotizacionesByRequerimiento);

// ←←← CORRECCIÓN AQUÍ ←←←
router.put('/:id/seleccionar', autorizar(['contabilidad', 'admin']), marcarCotizacionSeleccionada);

export default router;