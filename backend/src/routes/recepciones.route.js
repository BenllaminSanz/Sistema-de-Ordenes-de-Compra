import express from 'express';
const router = express.Router({ mergeParams: true });
import { listar, crear, marcarEntregado } from '../controllers/recepcionesController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';

router.use(autenticar);

// GET  /api/ordenes-compra/:orden_id/recepciones
router.get('/',    listar);
// POST /api/ordenes-compra/:orden_id/recepciones
router.post('/',   autorizar('contabilidad','admin'), crear);
// PATCH /api/ordenes-compra/:orden_id/recepciones/:id/entregar
router.patch('/:id/entregar', autorizar('contabilidad','gerente','admin','solicitante'), marcarEntregado);

export default router;