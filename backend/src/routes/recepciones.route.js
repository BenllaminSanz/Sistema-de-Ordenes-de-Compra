import { Router } from 'express';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';
import { listar, resumenItems, crear, actualizar, eliminar } from '../controllers/recepcionesController.js';

const router = Router({ mergeParams: true });

router.use(autenticar);

router.get('/', listar);
router.get('/resumen-items', resumenItems);

router.post('/', autorizar('contabilidad', 'admin'), crear);
router.put('/:id', autorizar('contabilidad', 'admin'), actualizar);
router.delete('/:id', autorizar('contabilidad', 'admin'), eliminar);

export default router;