import { compare, hash as _hash } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { 
  buscarPorEmail, 
  buscarPorId, 
  actualizarPassword, 
  crear, 
  listar, 
  actualizar,
  emailEnUsoPorOtro,
  cambiarEstado,
  crearSolicitante,
  guardarTokenVerificacion,
  buscarPorTokenVerificacion,
  marcarEmailVerificado
} from '../models/usuario.js';

const ROLES_VALIDOS = ['solicitante', 'contabilidad', 'admin'];

function puedeGestionarUsuario(actor, target) {
  if (!actor || !target) return false;
  if (actor.rol === 'admin') return true;
  if (actor.rol === 'contabilidad' && target.rol !== 'admin') return true;
  return false;
}

function puedeAsignarRol(actor, rol) {
  if (!ROLES_VALIDOS.includes(rol)) return false;
  if (actor.rol === 'admin') return true;
  return actor.rol === 'contabilidad' && rol !== 'admin';
}
import { enviarCorreoVerificacion } from '../utils/emailService.js';
import logger from '../utils/logger.js';
import { enviarCotizacionesPendientesOportunista } from './cotizacionesController.js';

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ mensaje: 'Email y contraseña son requeridos' });
    }

    const usuario = await buscarPorEmail(email.toLowerCase().trim());

    if (!usuario) {
      return res.status(401).json({ mensaje: 'El correo electrónico o la contraseña son incorrectos' });
    }

    if (!usuario.activo) {
      return res.status(403).json({ mensaje: 'Usuario desactivado. Contacta al administrador' });
    }

    const passwordValida = await compare(password, usuario.password_hash);
    if (!passwordValida) {
      return res.status(401).json({ mensaje: 'El correo electrónico o la contraseña son incorrectos' });
    }

    // Bloquear login si el correo no ha sido verificado
    if (usuario.email_verificado !== 1) {
      return res.status(403).json({ 
        mensaje: 'Debes confirmar tu correo electrónico antes de iniciar sesión. Revisa tu bandeja de entrada.' 
      });
    }

    const payload = {
      id:     usuario.id,
      nombre: usuario.nombre,
      email:  usuario.email,
      rol:    usuario.rol,
    };

    const jwtExpires = process.env.JWT_EXPIRES_IN || process.env.JWT_EXPIRES || '8h';

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: jwtExpires,
    });

    res.json({
      token,
      usuario: payload,
      expira_en: jwtExpires,
    });

    // Envío oportunista de cotizaciones pendientes (solo para roles con permisos)
    if (['contabilidad', 'admin'].includes(usuario.rol)) {
      enviarCotizacionesPendientesOportunista().catch(err => {
        logger.error('[Login] Error enviando cotizaciones pendientes:', err.message);
      });
    }

  } catch (err) {
    logger.error('Error en login', { error: err.message, stack: err.stack });
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
async function perfil(req, res) {
  try {
    const usuario = await buscarPorId(req.usuario.id);
    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    res.json(usuario);
  } catch (err) {
    logger.error('[perfil]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── POST /api/auth/cambiar-password ─────────────────────────────────────────
async function cambiarPassword(req, res) {
  try {
    const { password_actual, password_nuevo } = req.body;

    if (!password_actual || !password_nuevo) {
      return res.status(400).json({ mensaje: 'Ambos campos de contraseña son requeridos' });
    }
    if (password_nuevo.length < 6) {
      return res.status(400).json({ mensaje: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    const usuario = await buscarPorEmail(req.usuario.email);
    const valida  = await compare(password_actual, usuario.password_hash);

    if (!valida) {
      return res.status(401).json({ mensaje: 'Contraseña actual incorrecta' });
    }

    const hash = await _hash(password_nuevo, 12);
    await actualizarPassword(req.usuario.id, hash);

    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (err) {
    logger.error('[cambiarPassword]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── POST /api/auth/registro  (solo admin) ────────────────────────────────────
async function registro(req, res) {
  try {
    const { nombre, email, password, rol } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ mensaje: 'Nombre, email y contraseña son requeridos' });
    }
    if (password.length < 8) {
      return res.status(400).json({ mensaje: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const rolFinal = rol || 'solicitante';
    if (!ROLES_VALIDOS.includes(rolFinal)) {
      return res.status(400).json({ mensaje: `Rol inválido. Opciones: ${ROLES_VALIDOS.join(', ')}` });
    }
    if (!puedeAsignarRol(req.usuario, rolFinal)) {
      return res.status(403).json({ mensaje: 'No tienes permiso para crear usuarios con rol administrador' });
    }

    const existe = await buscarPorEmail(email.toLowerCase().trim());
    if (existe) {
      return res.status(409).json({ mensaje: 'Ya existe un usuario con ese email' });
    }

    const password_hash = await _hash(password, 12);
    const id = await crear({
      nombre:        nombre.trim(),
      email:         email.toLowerCase().trim(),
      password_hash,
      rol:           rolFinal,
    });

    const nuevo = await buscarPorId(id);
    res.status(201).json(nuevo);
  } catch (err) {
    logger.error('[registro]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── GET /api/auth/usuarios  (contabilidad / admin) ───────────────────────────
async function listarUsuarios(req, res) {
  try {
    const { activo } = req.query;
    const usuarios = await listar({ activo });
    res.json(usuarios);
  } catch (err) {
    logger.error('[listarUsuarios]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── PATCH /api/auth/usuarios/:id  (contabilidad / admin) ─────────────────────
async function actualizarUsuario(req, res) {
  try {
    const id = Number(req.params.id);
    const { nombre, email, rol } = req.body;

    const existente = await buscarPorId(id);
    if (!existente) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    if (!puedeGestionarUsuario(req.usuario, existente)) {
      return res.status(403).json({ mensaje: 'No tienes permiso para editar este usuario' });
    }

    if (!puedeAsignarRol(req.usuario, rol)) {
      return res.status(403).json({ mensaje: 'No tienes permiso para asignar el rol administrador' });
    }

    const emailLimpio = email.toLowerCase().trim();
    if (await emailEnUsoPorOtro(emailLimpio, id)) {
      return res.status(409).json({ mensaje: 'Ya existe otro usuario con ese correo electrónico' });
    }

    const afectados = await actualizar(id, {
      nombre: nombre.trim(),
      email: emailLimpio,
      rol,
    });

    if (!afectados) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    res.json(await buscarPorId(id));
  } catch (err) {
    logger.error('[actualizarUsuario]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── PATCH /api/auth/usuarios/:id/password  (contabilidad / admin) ─────────────
async function restablecerPasswordUsuario(req, res) {
  try {
    const id = Number(req.params.id);
    const { password_nuevo } = req.body;

    const existente = await buscarPorId(id);
    if (!existente) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    if (!puedeGestionarUsuario(req.usuario, existente)) {
      return res.status(403).json({ mensaje: 'No tienes permiso para cambiar la contraseña de este usuario' });
    }

    const hash = await _hash(password_nuevo, 12);
    await actualizarPassword(id, hash);

    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (err) {
    logger.error('[restablecerPasswordUsuario]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── PATCH /api/auth/usuarios/:id/estado  (contabilidad / admin) ───────────────
async function cambiarEstadoUsuario(req, res) {
  try {
    const { activo } = req.body;
    if (activo === undefined) {
      return res.status(400).json({ mensaje: "El campo 'activo' es requerido (true/false)" });
    }
    if (Number(req.params.id) === req.usuario.id) {
      return res.status(400).json({ mensaje: 'No puedes desactivar tu propio usuario' });
    }

    const existente = await buscarPorId(req.params.id);
    if (!existente) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    if (!puedeGestionarUsuario(req.usuario, existente)) {
      return res.status(403).json({ mensaje: 'No tienes permiso para cambiar el estado de este usuario' });
    }

    const afectados = await cambiarEstado(req.params.id, activo);
    if (afectados === 0) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    res.json({ mensaje: `Usuario ${activo ? 'activado' : 'desactivado'} correctamente` });
  } catch (err) {
    logger.error('[cambiarEstadoUsuario]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── POST /api/auth/registro-solicitante  (PÚBLICO - solo solicitantes) ─────────
async function registroSolicitante(req, res) {
  try {
    const { nombre, email, password } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ mensaje: 'Nombre, correo y contraseña son requeridos' });
    }
    if (password.length < 8) {
      return res.status(400).json({ mensaje: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const emailLimpio = email.toLowerCase().trim();

    const existe = await buscarPorEmail(emailLimpio);
    if (existe) {
      return res.status(409).json({ mensaje: 'Ya existe una cuenta con este correo electrónico' });
    }

    // Generar token de verificación seguro
    const token = crypto.randomBytes(32).toString('hex');
    const expiracion = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas

    const password_hash = await _hash(password, 12);

    const id = await crearSolicitante({
      nombre: nombre.trim(),
      email: emailLimpio,
      password_hash,
      token_verificacion: token,
      token_expiracion: expiracion
    });

    // Enviar correo de verificación (no bloqueante)
    logger.info(`[Auth] Intentando enviar correo de verificación a ${emailLimpio} usando config actual...`);
    enviarCorreoVerificacion(nombre.trim(), emailLimpio, token).then(r => {
      if (r.success) {
        logger.info(`[Auth] ✓ Correo de verificación enviado exitosamente a ${emailLimpio}`);
      } else {
        logger.error('[Auth] ✗ Falló el envío de verificación:', r);
      }
    }).catch(err => {
      logger.error('[Auth] ✗ Excepción enviando correo de verificación:', err.message);
      logger.error(err);
    });

    res.status(201).json({
      mensaje: 'Registro exitoso. Revisa tu correo electrónico para confirmar tu cuenta.',
      email: emailLimpio
    });
  } catch (err) {
    logger.error('[registroSolicitante]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── GET /api/auth/verificar-email?token=xxx  (PÚBLICO) ────────────────────────
async function verificarEmail(req, res) {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ mensaje: 'Token de verificación requerido' });
    }

    const usuario = await buscarPorTokenVerificacion(token);

    if (!usuario) {
      return res.status(400).json({ mensaje: 'Token inválido o ya utilizado' });
    }

    // Verificar expiración
    if (usuario.token_expiracion && new Date() > new Date(usuario.token_expiracion)) {
      return res.status(400).json({ mensaje: 'El enlace de verificación ha expirado. Regístrate nuevamente.' });
    }

    await marcarEmailVerificado(usuario.id);

    res.json({
      mensaje: '¡Correo verificado exitosamente! Ya puedes iniciar sesión.',
      email: usuario.email
    });
  } catch (err) {
    logger.error('[verificarEmail]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

export { 
  login, 
  perfil, 
  cambiarPassword, 
  registro, 
  listarUsuarios,
  actualizarUsuario,
  restablecerPasswordUsuario,
  cambiarEstadoUsuario,
  registroSolicitante,
  verificarEmail
};