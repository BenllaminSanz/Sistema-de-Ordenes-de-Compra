import express from 'express';
const router = express.Router();

import { listar, obtener, crear, actualizar, cambiarEstado } from '../controllers/catalogoController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';

// Todas las rutas del catálogo requieren autenticación
router.use(autenticar);

// Cualquier usuario autenticado puede consultar el catálogo
router.get('/', listar);
router.get('/:id', obtener);

// Solo Contabilidad y Admin pueden gestionar el catálogo
router.post('/',     autorizar('contabilidad', 'admin'), crear);
router.put('/:id',   autorizar('contabilidad', 'admin'), actualizar);
router.patch('/:id/estado', autorizar('contabilidad', 'admin'), cambiarEstado);

export default router;