// backend/src/middlewares/authMiddleware.js
import jwt from 'jsonwebtoken';
import { promisify } from 'util';

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

        req.usuario = decoded;
        next();
    } catch (error) {
        console.error('Error en verificarToken:', error);
        return res.status(401).json({
            success: false,
            message: 'Token inválido o expirado'
        });
    }
};

// Alias para que sea compatible con tu código anterior
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

        const rolUsuario = req.usuario.rol;

        // Admin = superusuario → siempre pasa
        if (rolUsuario === 'admin') return next();

        if (rolesPermitidos.includes(rolUsuario)) return next();

        return res.status(403).json({
            success: false,
            message: `Acceso denegado. Solo ${rolesPermitidos.join(' o ')} pueden realizar esta acción.`
        });
    };
};

// Alias para que puedas seguir usando autorizar('admin')
const autorizar = (roles) => {
    const rolesArray = Array.isArray(roles) ? roles : [roles];
    return verificarRol(rolesArray);
};

// Middlewares específicos (útiles para otras rutas)
const esSolicitante = verificarRol(['solicitante']);
const esContabilidad = verificarRol(['contabilidad']);
const esAdmin = verificarRol(['admin']);
const esContabilidadOAdmin = verificarRol(['contabilidad', 'admin']);
const esSolicitanteOAdmin = verificarRol(['solicitante', 'admin']);

export {
    verificarToken,
    autenticar,
    autorizar,
    esSolicitante,
    esContabilidad,
    esAdmin,
    esContabilidadOAdmin,
    esSolicitanteOAdmin
};