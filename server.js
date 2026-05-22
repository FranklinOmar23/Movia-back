const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
require('dotenv').config();

// Rutas
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const paymentRoutes = require('./routes/payments');    // Stripe
const plansRoutes = require('./routes/plans');
const paypalRoutes = require('./routes/paypal');       // PayPal ← NUEVA

// Job diario de cobros
const { startDailyJob } = require('./jobs/dailyCharge');

const app = express();

// IMPORTANTE: El webhook de Stripe necesita el body sin parsear (raw)
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// ──────────────────────────────────────────────────────
// CONFIGURACIÓN CORS
// ──────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:4200',
  'http://localhost:8080',
  'https://movia.arcodedominicana.com',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS bloqueado para: ${origin}`);
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
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
app.use('/api/payments', paymentRoutes);     // Stripe
app.use('/api/plans', plansRoutes);
app.use('/api/paypal', paypalRoutes);        // PayPal ← NUEVA

// Iniciar el job diario de cobros
startDailyJob();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor MOVIA corriendo en http://localhost:${PORT}`);
  console.log(`📚 Swagger: http://localhost:${PORT}/api-docs`);
  console.log(`💳 Stripe:  /api/payments/*`);
  console.log(`🅿️  PayPal:  /api/paypal/*`);
  console.log(`📅 Job diario programado`);
});