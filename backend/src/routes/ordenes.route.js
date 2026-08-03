import express from 'express';
const router = express.Router({ mergeParams: true });
import {
  listar,
  obtener,
  crear,
  cambiarEstado,
  actualizarDatatextnow,
  actualizarItemCatalogo,
  actualizarNotas,
} from '../controllers/ordenesController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';

router.use(autenticar);

router.get('/',                                                       listar);
router.get('/:id',                                                    obtener);
router.post('/',   autorizar('compras','admin'),       crear);
router.patch('/:id/estado', autorizar('compras','admin'), cambiarEstado);
// Actualiza el número de PO / Order code de DataTextNow (se obtiene de los reportes Excel externos)
router.patch('/:id/datatextnow', autorizar('compras','admin'),   actualizarDatatextnow);
// Notas de compras (editables durante todo el ciclo de la OC)
router.patch('/:id/notas', autorizar('compras','admin'), actualizarNotas);
router.patch('/:id/items/:catalogoId', autorizar('compras','admin'), actualizarItemCatalogo);

export default router;