import express from 'express';
const router = express.Router({ mergeParams: true });
import { listar, obtener, crear, cambiarEstado, actualizarDatatextnow, actualizarItemCatalogo } from '../controllers/ordenesController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';

router.use(autenticar);

router.get('/',                                                       listar);
router.get('/:id',                                                    obtener);
router.post('/',   autorizar('contabilidad','admin'),       crear);
router.patch('/:id/estado', autorizar('contabilidad','admin'), cambiarEstado);
// Actualiza el número de PO / Order code de DataTextNow (se obtiene de los reportes Excel externos)
router.patch('/:id/datatextnow', autorizar('contabilidad','admin'),   actualizarDatatextnow);
router.patch('/:id/items/:catalogoId', autorizar('contabilidad','admin'), actualizarItemCatalogo);

export default router;