import { Router } from 'express';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';
import { listar, resumenItems, crear, actualizar, eliminar } from '../controllers/recepcionesController.js';

const router = Router({ mergeParams: true });

router.use(autenticar);

router.get('/', listar);
router.get('/resumen-items', resumenItems);

router.post('/', autorizar('compras', 'admin'), crear);
router.put('/:id', autorizar('compras', 'admin'), actualizar);
router.delete('/:id', autorizar('compras', 'admin'), eliminar);

export default router;