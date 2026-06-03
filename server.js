const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

// ── RUTAS (importadas UNA sola vez) ──────────────────

const authRoutes        = require('./routes/auth');
const adminRoutes       = require('./routes/admin');
const paymentRoutes     = require('./routes/payments');
const plansRoutes       = require('./routes/plans');
const paypalRoutes      = require('./routes/paypal');
const watchHistoryRoutes= require('./routes/watchHistory');
const watchlistRoutes   = require('./routes/watchlist');
const usersRoutes       = require('./routes/users');
const groupsRoutes      = require('./routes/groups');
const referralRoutes    = require('./routes/referrals');
const partyRoutes       = require('./routes/partyRoutes');
const { startDailyJob } = require('./jobs/dailyCharge');

// ── APP y HTTP SERVER ────────────────────────────────

const app = express();
const httpServer = createServer(app);

// ── SOCKET.IO ────────────────────────────────────────

const io = new Server(httpServer, {
  cors: {
    origin: [
      'http://localhost:3000', 'http://localhost:3001',
      'http://localhost:5173',
      'https://movia.arcodedominicana.com',
      'https://maroon-goshawk-691607.hostingersite.com',
      'https://mintcream-meerkat-111545.hostingersite.com'
      
    ],
    credentials: true
  }
});
require('./socket/watchPartySocket')(io);

// ── CORS ─────────────────────────────────────────────

const allowedOrigins = [
  'http://localhost:3000', 'http://localhost:3001',
  'http://localhost:5173', 'http://localhost:4200',
  'http://localhost:8080',
  'https://movia.arcodedominicana.com',
  'https://maroon-goshawk-691607.hostingersite.com',
  'https://mintcream-meerkat-111545.hostingersite.com'
  
];
app.use(cors({
  origin: (origin, cb) =>
    (!origin || allowedOrigins.includes(origin))
      ? cb(null, true)
      : cb(new Error('No permitido por CORS')),
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── STRIPE WEBHOOK (raw body, ANTES de express.json) ─

app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// ── JSON PARSER ──────────────────────────────────────

app.use(express.json());

// ── HEALTH CHECK ─────────────────────────────────────

app.get('/', (req, res) => res.json({
  message: 'MOVIA API funcionando 🎬', version: '1.0.0', docs: '/api-docs'
}));

// ── RUTAS (montadas UNA sola vez) ────────────────────

app.use('/api/auth',          authRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/payments',      paymentRoutes);
app.use('/api/plans',         plansRoutes);
app.use('/api/paypal',        paypalRoutes);
app.use('/api/watch-history', watchHistoryRoutes);
app.use('/api/watchlist',     watchlistRoutes);
app.use('/api/users',         usersRoutes);
app.use('/api/groups',        groupsRoutes);
app.use('/api/referrals',     referralRoutes);
app.use('/api/parties',       partyRoutes);

// ── SWAGGER ──────────────────────────────────────────

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'MOVIA API - Documentación'
}));
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ── 404 ──────────────────────────────────────────────

app.use((req, res) => res.status(404).json({
  error: 'Ruta no encontrada',
  message: `La ruta ${req.originalUrl} no existe en la API`
}));

// ── ARRANCAR ─────────────────────────────────────────

startDailyJob();
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🎬 MOVIA API en http://localhost:${PORT}`);
  console.log(`📚 Swagger: http://localhost:${PORT}/api-docs`);
});