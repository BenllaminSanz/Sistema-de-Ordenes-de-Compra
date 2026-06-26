import express from 'express';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';
import { getStats } from '../controllers/dashboardController.js';

const router = express.Router();

// Todos los roles autenticados pueden ver el dashboard
router.get('/stats', autenticar, getStats);

export default router;
