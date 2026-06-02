import express from 'express';
const router = express.Router();
import { generarReporteOrdenesCompra, generarReporteStatusPOS } from '../controllers/reportesController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';

// Solo contabilidad y admin pueden generar reportes
router.use(autenticar);
router.get('/ordenes-compra', autorizar('contabilidad', 'admin'), generarReporteOrdenesCompra);
router.get('/status-pos-hilos', autorizar('contabilidad', 'admin'), generarReporteStatusPOS);

export default router;
