import express from 'express';
const router = express.Router();
import { generarReporteOrdenesCompra } from '../controllers/reportesController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';

// Solo contabilidad y admin pueden generar reportes
router.use(autenticar);
router.get('/ordenes-compra', autorizar('contabilidad', 'admin'), generarReporteOrdenesCompra);

export default router;
