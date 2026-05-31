import { Router } from 'express';
import { autenticar, autorizar } from '../middlewares/authMiddleware.js';
import { validate } from '../validations/validationMiddleware.js';
import { 
  loginSchema, 
  cambiarPasswordSchema, 
  registroSolicitanteSchema 
} from '../validations/schemas.js';

const router = Router();

import { 
  login, 
  perfil, 
  cambiarPassword, 
  registro, 
  listarUsuarios, 
  cambiarEstadoUsuario,
  registroSolicitante,
  verificarEmail
} from '../controllers/authController.js';

// ─── Rutas públicas (sin token) ───────────────────────────────────────────────
router.post('/login', validate(loginSchema), login);

// Registro público para solicitantes (con verificación de correo)
router.post('/registro-solicitante', validate(registroSolicitanteSchema), registroSolicitante);

// Verificación de correo electrónico
router.get('/verificar-email', verificarEmail);

// ─── Rutas autenticadas ───────────────────────────────────────────────────────
router.get('/me',               autenticar, perfil);
router.post('/cambiar-password', autenticar, validate(cambiarPasswordSchema), cambiarPassword);

// ─── Rutas solo admin (superusuario) ──────────────────────────────────────────
router.post('/registro',
  autenticar,
  autorizar('admin'),
  registro
);

router.get('/usuarios',
  autenticar,
  autorizar('admin'),
  listarUsuarios
);

router.patch('/usuarios/:id/estado',
  autenticar,
  autorizar('admin'),
  cambiarEstadoUsuario
);

export default router;