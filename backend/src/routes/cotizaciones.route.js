import express from 'express';
const router = express.Router({ mergeParams: true });
import { listar, crear, actualizar, seleccionar, eliminar, getCotizacionesByRequerimiento, marcarCotizacionSeleccionada } from '../controllers/cotizacionesController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';

router.use(autenticar);

// GET    /api/requerimientos/:requerimiento_id/cotizaciones
router.get('/',    listar);
// POST   /api/requerimientos/:requerimiento_id/cotizaciones
router.post('/',   autorizar('contabilidad','admin'), crear);
// PUT    /api/requerimientos/:requerimiento_id/cotizaciones/:id
router.put('/:id', autorizar('contabilidad','admin'), actualizar);
// PATCH  /api/requerimientos/:requerimiento_id/cotizaciones/:id/seleccionar
router.patch('/:id/seleccionar', autorizar('gerente','admin'), seleccionar);
// DELETE /api/requerimientos/:requerimiento_id/cotizaciones/:id
router.delete('/:id', autorizar('contabilidad','admin'), eliminar);
//
router.get('/requerimiento/:requerimientoId', getCotizacionesByRequerimiento);
//
router.put('/:id/seleccionar', roleMiddleware(['contabilidad', 'admin']), marcarCotizacionSeleccionada);

export default router;