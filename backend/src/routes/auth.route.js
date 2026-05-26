import express from 'express';
const router = express.Router();
import { login, perfil, cambiarPassword, registro, listarUsuarios, cambiarEstadoUsuario } from '../controllers/authController.js';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';

// ─── Rutas públicas (sin token) ───────────────────────────────────────────────
router.post('/login', login);

// ─── Rutas autenticadas ───────────────────────────────────────────────────────
router.get('/me',               autenticar, perfil);
router.post('/cambiar-password', autenticar, cambiarPassword);

// ─── Rutas solo admin ─────────────────────────────────────────────────────────
router.post('/registro',
  autenticar, autorizar('admin'),
  registro
);
router.get('/usuarios',
  autenticar, autorizar('admin'),
  listarUsuarios
);
router.patch('/usuarios/:id/estado',
  autenticar, autorizar('admin'),
  cambiarEstadoUsuario
);

export default router;