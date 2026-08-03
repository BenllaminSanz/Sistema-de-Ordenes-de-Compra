import express from 'express';
const router = express.Router();
import { listar, crear, actualizar, eliminar } from '../controllers/unidadesController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';

router.use(autenticar);

router.get('/', listar);
router.post('/', autorizar('compras', 'admin'), crear);
router.put('/:id', autorizar('compras', 'admin'), actualizar);
router.delete('/:id', autorizar('compras', 'admin'), eliminar);

export default router;
