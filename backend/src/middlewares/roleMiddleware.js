// Validación del Rol de Usuario
export default (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).send("No tienes permiso");
    }
    next();
  };
};