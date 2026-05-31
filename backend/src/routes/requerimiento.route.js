import express from 'express';
const router = express.Router();
import { listar, obtener, crear, actualizar, cambiarEstado, eliminar } from '../controllers/requerimientosController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';
import { validate } from '../validations/validationMiddleware.js';
import { 
  crearRequerimientoSchema, 
  actualizarRequerimientoSchema, 
  cambiarEstadoRequerimientoSchema 
} from '../validations/schemas.js';

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
  validate(crearRequerimientoSchema),
  crear
);

/**
 * PUT /api/requerimientos/:id
 * El solicitante edita sus borradores; contabilidad y admin también pueden
 */
router.put(
  '/:id',
  autorizar('solicitante', 'contabilidad', 'admin'),
  validate(actualizarRequerimientoSchema),
  actualizar
);

/**
 * PATCH /api/requerimientos/:id/estado
 * - contabilidad/gerente/admin: transiciones normales (aprobar, rechazar, etc.)
 * - solicitante: solo puede enviar sus propios borradores a 'en_revision'
 */
router.patch(
  '/:id/estado',
  autorizar('solicitante', 'contabilidad', 'gerente', 'admin'),
  validate(cambiarEstadoRequerimientoSchema),
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