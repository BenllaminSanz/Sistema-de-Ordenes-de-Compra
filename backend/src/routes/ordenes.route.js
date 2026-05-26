import express from 'express';
const router = express.Router({ mergeParams: true });
import { listar, obtener, crear, cambiarEstado, actualizarDatatextnow } from '../controllers/ordenesController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';

router.use(autenticar);

router.get('/',                                                       listar);
router.get('/:id',                                                    obtener);
router.post('/',   autorizar('gerente','admin'),                      crear);
router.patch('/:id/estado', autorizar('contabilidad','gerente','admin'), cambiarEstado);
router.patch('/:id/datatextnow', autorizar('contabilidad','admin'),   actualizarDatatextnow);

export default router;