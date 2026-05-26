import express from 'express';
const router = express.Router();
import { listar, obtener, crear, actualizar, cambiarEstado } from '../controllers/proveedoresController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';

router.use(autenticar);

router.get('/',                                                   listar);
router.get('/:id',                                                obtener);
router.post('/',    autorizar('contabilidad','admin'),            crear);
router.put('/:id',  autorizar('contabilidad','admin'),            actualizar);
router.patch('/:id/estado', autorizar('admin'),                   cambiarEstado);

export default router;