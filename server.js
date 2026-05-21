const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
require('dotenv').config();

// Rutas
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const paymentRoutes = require('./routes/payments');

// Job diario de cobros
const { startDailyJob } = require('./jobs/dailyCharge');

const app = express();

// IMPORTANTE: El webhook de Stripe necesita el body sin parsear (raw)
// Esto debe ir ANTES de express.json()
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// Middlewares globales
app.use(cors());
app.use(express.json());

// Documentación Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check rápido
app.get('/', (req, res) => {
  res.json({ message: 'MOVIA API funcionando 🎬' });
});

// Montar rutas
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);

// Iniciar el job diario de cobros (node-cron)
startDailyJob();

// Arrancar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor MOVIA corriendo en http://localhost:${PORT}`);
  console.log(`� Documentación Swagger disponible en http://localhost:${PORT}/api-docs`);
  console.log(`�📅 Job de cobros diarios programado`);
});