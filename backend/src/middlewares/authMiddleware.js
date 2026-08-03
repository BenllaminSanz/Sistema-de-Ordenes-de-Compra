// backend/src/middlewares/authMiddleware.js
import jwt from 'jsonwebtoken';
import { promisify } from 'util';

/** Rol legacy `contabilidad` → `compras` (tokens y datos previos). */
function normalizarRol(rol) {
    if (rol === 'contabilidad') return 'compras';
    return rol;
}

// ─── Middleware principal de autenticación ───────────────────────────────
const verificarToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'No se proporcionó token de autenticación'
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

        req.usuario = {
            ...decoded,
            rol: normalizarRol(decoded.rol),
        };
        next();
    } catch (error) {
        console.error('Error en verificarToken:', error);
        return res.status(401).json({
            success: false,
            message: 'Token inválido o expirado'
        });
    }
};

// Alias (usado en rutas)
const autenticar = verificarToken;

// ─── Middleware genérico de roles (igual que tu autorizar) ───────────────
const verificarRol = (rolesPermitidos) => {
    return (req, res, next) => {
        if (!req.usuario || !req.usuario.rol) {
            return res.status(401).json({
                success: false,
                message: 'Usuario no autenticado'
            });
        }

        const rolUsuario = normalizarRol(req.usuario.rol);
        const permitidos = (rolesPermitidos || []).map(normalizarRol);

        // Admin = superusuario → siempre pasa
        if (rolUsuario === 'admin') return next();

        if (permitidos.includes(rolUsuario)) return next();

        return res.status(403).json({
            success: false,
            message: `Acceso denegado. Solo ${permitidos.join(' o ')} pueden realizar esta acción.`
        });
    };
};

// Acepta autorizar('admin'), autorizar('compras', 'admin') o autorizar(['compras', 'admin'])
const autorizar = (...roles) => {
    const rolesArray = roles.length === 1 && Array.isArray(roles[0])
        ? roles[0]
        : roles;
    return verificarRol(rolesArray);
};

// Middlewares específicos (útiles para otras rutas)
const esSolicitante = verificarRol(['solicitante']);
const esCompras = verificarRol(['compras']);
const esAdmin = verificarRol(['admin']);
const esComprasOAdmin = verificarRol(['compras', 'admin']);
const esSolicitanteOAdmin = verificarRol(['solicitante', 'admin']);
// Alias legacy (imports antiguos)
const esContabilidad = esCompras;
const esContabilidadOAdmin = esComprasOAdmin;

export {
    verificarToken,
    autenticar,
    autorizar,
    normalizarRol,
    esSolicitante,
    esCompras,
    esAdmin,
    esComprasOAdmin,
    esSolicitanteOAdmin,
    esContabilidad,
    esContabilidadOAdmin,
};