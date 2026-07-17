import express from 'express';
const router = express.Router();
import { listar, crear, actualizar, eliminar } from '../controllers/unidadesController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';

router.use(autenticar);

router.get('/', listar);
router.post('/', autorizar('contabilidad', 'admin'), crear);
router.put('/:id', autorizar('contabilidad', 'admin'), actualizar);
router.delete('/:id', autorizar('contabilidad', 'admin'), eliminar);

export default router;
