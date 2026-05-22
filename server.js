const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
require('dotenv').config();

// Rutas
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const paymentRoutes = require('./routes/payments');
const plansRoutes = require('./routes/plans');

// Job diario de cobros
const { startDailyJob } = require('./jobs/dailyCharge');

const app = express();

// IMPORTANTE: El webhook de Stripe necesita el body sin parsear (raw)
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// ──────────────────────────────────────────────────────
// CONFIGURACIÓN CORS
// ──────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',      // Backend
  'http://localhost:3001',      // Frontend React/Vue (puerto común)
  'http://localhost:5173',      // Frontend Vite
  'http://localhost:4200',      // Frontend Angular
  'http://localhost:8080',      // Frontend alternativo
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4200',
  'http://127.0.0.1:8080',
];

app.use(cors({
  origin: function (origin, callback) {
    // Permitir peticiones sin origin (Postman, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS bloqueado para origin: ${origin}`);
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,                 // Permitir cookies y headers de autenticación
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400                      // Cache preflight por 24 horas
}));

// Middlewares globales
app.use(express.json());

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: 'MOVIA API funcionando 🎬',
    docs: '/api-docs'
  });
});

// Montar rutas
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/plans', plansRoutes);

// Iniciar el job diario de cobros
startDailyJob();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor MOVIA corriendo en http://localhost:${PORT}`);
  console.log(`📚 Documentación Swagger: http://localhost:${PORT}/api-docs`);
  console.log(`📅 Job de cobros diarios programado`);
  console.log(`🌐 CORS habilitado para: ${allowedOrigins.join(', ')}`);
});