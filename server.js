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

// Middlewares globales
app.use(cors());
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
});