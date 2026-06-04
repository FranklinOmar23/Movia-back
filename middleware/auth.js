// middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  // ✅ Lista de endpoints públicos que no requieren autenticación
  const publicEndpoints = [
    '/api/groups/public',
    '/api/auth/login',
    '/api/auth/register',
    '/api/plans',
    '/api/groups/public-noauth' // si agregas este
  ];

  // Verificar si es un endpoint público
  const isPublicEndpoint = publicEndpoints.some(endpoint => 
    req.path.includes(endpoint)
  );

  const token = req.header('Authorization')?.replace('Bearer ', '');

  // Si es endpoint público y no hay token, continuar
  if (isPublicEndpoint && !token) {
    req.user = null;
    return next();
  }

  // Si es endpoint público pero hay token, verificar pero no fallar
  if (isPublicEndpoint && token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch (error) {
      // Token inválido pero es endpoint público, continuar
      req.user = null;
    }
    return next();
  }

  // Para endpoints privados, requerir token
  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};