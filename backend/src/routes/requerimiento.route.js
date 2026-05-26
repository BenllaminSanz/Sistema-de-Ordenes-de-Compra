import express from 'express';
const router = express.Router();
import { listar, obtener, crear, actualizar, cambiarEstado, eliminar } from '../controllers/requerimientosController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';

// Todas las rutas requieren estar autenticado
router.use(autenticar);

/**
 * GET /api/requerimientos
 * Todos los roles pueden listar (el modelo filtra por solicitante si aplica)
 */
router.get('/', listar);

/**
 * GET /api/requerimientos/:id
 * Todos los roles pueden ver el detalle
 */
router.get('/:id', obtener);

/**
 * POST /api/requerimientos
 * Solo solicitantes y admins crean requerimientos
 */
router.post(
  '/',
  autorizar('solicitante', 'admin'),
  crear
);

/**
 * PUT /api/requerimientos/:id
 * El solicitante edita sus borradores; contabilidad y admin también pueden
 */
router.put(
  '/:id',
  autorizar('solicitante', 'contabilidad', 'admin'),
  actualizar
);

/**
 * PATCH /api/requerimientos/:id/estado
 * Solo contabilidad y gerencia cambian el estado (aprobar, rechazar, etc.)
 */
router.patch(
  '/:id/estado',
  autorizar('contabilidad', 'admin'),
  cambiarEstado
);

/**
 * DELETE /api/requerimientos/:id
 * Solo admins eliminan (y solo si está en borrador)
 */
router.delete(
  '/:id',
  autorizar('admin'),
  eliminar
);

export default router;