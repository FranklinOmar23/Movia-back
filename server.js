const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// Crear Express PRIMERO
const app = express();

// Crear servidor HTTP
const httpServer = createServer(app);

// Inicializar Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'https://movia.arcodedominicana.com',
      'https://maroon-goshawk-691607.hostingersite.com'
    ],
    credentials: true
  }
});

// Inicializar eventos de Watch Party
require('./socket/watchPartySocket')(io);

// ──────────────────────────────────────────────────────
// CONFIGURACIÓN CORS — PRIMERO QUE TODO
// ──────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:4200',
  'http://localhost:8080',
  'https://movia.arcodedominicana.com',
  'https://maroon-goshawk-691607.hostingersite.com',
];

const corsOptions = {
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
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
// No es necesario app.options('*', ...) porque cors() ya maneja OPTIONS

// ──────────────────────────────────────────────────────
// WEBHOOK DE STRIPE — body raw, debe ir ANTES de express.json()
// ──────────────────────────────────────────────────────
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// ──────────────────────────────────────────────────────
// MIDDLEWARE GLOBAL PARA PARSEAR JSON (para TODAS las demás rutas)
// ──────────────────────────────────────────────────────
app.use(express.json());

// ──────────────────────────────────────────────────────
// RUTAS (TODAS después de express.json())
// ──────────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const paymentRoutes = require('./routes/payments');
const plansRoutes = require('./routes/plans');
const paypalRoutes = require('./routes/paypal');
const watchHistoryRoutes = require('./routes/watchHistory');
const watchlistRoutes = require('./routes/watchlist');
const usersRoutes = require('./routes/users');
const groupsRoutes = require('./routes/groups');
const partyRoutes = require('./routes/partyRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/paypal', paypalRoutes);
app.use('/api/watch-history', watchHistoryRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/parties', partyRoutes);

// ──────────────────────────────────────────────────────
// SWAGGER UI
// ──────────────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'MOVIA API - Documentación',
  swaggerOptions: {
    url: '/api-docs.json'
  }
}));

// Endpoint para servir el JSON de Swagger
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ──────────────────────────────────────────────────────
// HEALTH CHECK
// ──────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: 'MOVIA API funcionando 🎬',
    version: '1.0.0',
    docs: '/api-docs',
    endpoints: {
      auth: '/api/auth',
      admin: '/api/admin',
      payments: '/api/payments',
      paypal: '/api/paypal',
      plans: '/api/plans',
      watchHistory: '/api/watch-history',
      watchlist: '/api/watchlist'
    }
  });
});

// ──────────────────────────────────────────────────────
// MANEJO DE ERRORES 404 (SIEMPRE AL FINAL)
// ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    message: `La ruta ${req.originalUrl} no existe en la API`
  });
});

// ──────────────────────────────────────────────────────
// INICIAR SERVIDOR
// ──────────────────────────────────────────────────────
const { startDailyJob } = require('./jobs/dailyCharge');
startDailyJob();

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║           🎬  MOVIA API  🎬                  ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  🚀 Servidor:   http://localhost:${PORT}`);
  console.log(`║  📚 Swagger:    http://localhost:${PORT}/api-docs`);
  console.log(`║  🎥 Socket.IO:  Activo`);
  console.log(`║  💳 Stripe:     /api/payments/*`);
  console.log(`║  🅿️  PayPal:     /api/paypal/*`);
  console.log(`║  📺 Historial:  /api/watch-history/*`);
  console.log(`║  🔖 Watchlist:  /api/watchlist/*`);
  console.log(`║  📅 Job diario: Programado (00:05)`);
  console.log('╚══════════════════════════════════════════════╝');
});