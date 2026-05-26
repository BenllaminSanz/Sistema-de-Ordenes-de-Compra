import { compare, hash as _hash } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { buscarPorEmail, buscarPorId, actualizarPassword, crear, listar, cambiarEstado } from '../models/usuario.js';

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ mensaje: 'Email y contraseña son requeridos' });
    }

    const usuario = await buscarPorEmail(email.toLowerCase().trim());

    if (!usuario) {
      return res.status(401).json({ mensaje: 'Credenciales incorrectas' });
    }

    if (!usuario.activo) {
      return res.status(403).json({ mensaje: 'Usuario desactivado. Contacta al administrador' });
    }

    const passwordValida = await compare(password, usuario.password_hash);
    if (!passwordValida) {
      return res.status(401).json({ mensaje: 'Credenciales incorrectas' });
    }

    const payload = {
      id:     usuario.id,
      nombre: usuario.nombre,
      email:  usuario.email,
      rol:    usuario.rol,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    res.json({
      token,
      usuario: payload,
      expira_en: process.env.JWT_EXPIRES_IN || '8h',
    });
  } catch (err) {
    console.error('[login]', err);
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
    console.error('[perfil]', err);
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
    console.error('[cambiarPassword]', err);
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

    const roles_validos = ['solicitante', 'contabilidad', 'gerente', 'admin'];
    if (rol && !roles_validos.includes(rol)) {
      return res.status(400).json({ mensaje: `Rol inválido. Opciones: ${roles_validos.join(', ')}` });
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
      rol:           rol || 'solicitante',
    });

    const nuevo = await buscarPorId(id);
    res.status(201).json(nuevo);
  } catch (err) {
    console.error('[registro]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── GET /api/auth/usuarios  (solo admin) ─────────────────────────────────────
async function listarUsuarios(req, res) {
  try {
    const usuarios = await listar();
    res.json(usuarios);
  } catch (err) {
    console.error('[listarUsuarios]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

// ─── PATCH /api/auth/usuarios/:id/estado  (solo admin) ────────────────────────
async function cambiarEstadoUsuario(req, res) {
  try {
    const { activo } = req.body;
    if (activo === undefined) {
      return res.status(400).json({ mensaje: "El campo 'activo' es requerido (true/false)" });
    }
    if (Number(req.params.id) === req.usuario.id) {
      return res.status(400).json({ mensaje: 'No puedes desactivar tu propio usuario' });
    }

    const afectados = await cambiarEstado(req.params.id, activo);
    if (afectados === 0) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    res.json({ mensaje: `Usuario ${activo ? 'activado' : 'desactivado'} correctamente` });
  } catch (err) {
    console.error('[cambiarEstadoUsuario]', err);
    res.status(500).json({ mensaje: 'Error interno del servidor' });
  }
}

export { login, perfil, cambiarPassword, registro, listarUsuarios, cambiarEstadoUsuario };