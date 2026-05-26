// Generación de tokens de solicitud
import jwt from 'jsonwebtoken';

/**
 * Verifica que la petición lleve un JWT válido en el header:
 *   Authorization: Bearer <token>
 */
function autenticar(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ mensaje: 'Token requerido' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = payload; // { id, nombre, email, rol }
    next();
  } catch {
    return res.status(401).json({ mensaje: 'Token inválido o expirado' });
  }
}

/**
 * Fábrica de middleware para restringir acceso por rol.
 * Uso: autorizar('gerente')  |  autorizar('contabilidad', 'admin')
 */
function autorizar(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario?.rol)) {
      return res.status(403).json({
        mensaje: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}`,
      });
    }
    next();
  };
}

export  { autenticar, autorizar };