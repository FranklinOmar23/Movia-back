/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Panel de administración - Gestión de usuarios, suscripciones, transacciones y planes
 */

const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminController = require('../controllers/adminController');

// ──────────────────────────────────────────────────────
// DASHBOARD STATS
// ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Obtener estadísticas del dashboard
 *     description: Retorna totalUsers, activeUsers, activeSubscriptions, mrr, ingresos, pagos, tasa de crecimiento
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas del panel
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalUsers:
 *                   type: integer
 *                   example: 150
 *                 activeUsers:
 *                   type: integer
 *                   example: 120
 *                 newUsersThisMonth:
 *                   type: integer
 *                   example: 15
 *                 activeSubscriptions:
 *                   type: integer
 *                   example: 100
 *                 usersUpToDate:
 *                   type: integer
 *                   example: 85
 *                 usersOverdue:
 *                   type: integer
 *                   example: 15
 *                 mrr:
 *                   type: number
 *                   example: 799.00
 *                 currentMonthRevenue:
 *                   type: number
 *                   example: 1250.50
 *                 lastMonthRevenue:
 *                   type: number
 *                   example: 1100.00
 *                 growthRate:
 *                   type: number
 *                   example: 13.68
 *                 pendingPayments:
 *                   type: integer
 *                   example: 5
 *                 failedPayments:
 *                   type: integer
 *                   example: 3
 *                 successfulPayments:
 *                   type: integer
 *                   example: 45
 *       401:
 *         description: No autorizado - Token inválido o no proporcionado
 *       403:
 *         description: Prohibido - No tiene rol de administrador
 */
router.get('/stats', adminAuth, adminController.getStats);

// ──────────────────────────────────────────────────────
// PLANES (ADMIN CRUD)
// ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/plans:
 *   get:
 *     tags: [Admin]
 *     summary: Obtener todos los planes (admin)
 *     description: Retorna todos los planes incluyendo inactivos
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de planes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   description:
 *                     type: string
 *                   price:
 *                     type: number
 *                   currency:
 *                     type: string
 *                   billing_interval:
 *                     type: string
 *                   is_active:
 *                     type: boolean
 */
router.get('/plans', adminAuth, adminController.getPlans);

/**
 * @swagger
 * /api/admin/plans:
 *   post:
 *     tags: [Admin]
 *     summary: Crear un nuevo plan
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *             properties:
 *               name:
 *                 type: string
 *                 example: Plan Oro
 *               description:
 *                 type: string
 *                 example: Acceso ilimitado en 4K
 *               price:
 *                 type: number
 *                 example: 15.99
 *               currency:
 *                 type: string
 *                 default: USD
 *               billing_interval:
 *                 type: string
 *                 enum: [biweekly, monthly, yearly]
 *                 default: biweekly
 *               is_active:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Plan creado exitosamente
 *       400:
 *         description: Datos inválidos
 */
router.post('/plans', adminAuth, adminController.createPlan);

/**
 * @swagger
 * /api/admin/plans/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Actualizar un plan
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               billing_interval:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Plan actualizado
 *       404:
 *         description: Plan no encontrado
 */
router.put('/plans/:id', adminAuth, adminController.updatePlan);

/**
 * @swagger
 * /api/admin/plans/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Eliminar un plan
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Plan eliminado
 *       400:
 *         description: No se puede eliminar, tiene suscripciones activas
 *       404:
 *         description: Plan no encontrado
 */
router.delete('/plans/:id', adminAuth, adminController.deletePlan);

// ──────────────────────────────────────────────────────
// USUARIOS
// ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/users:
 *   post:
 *     tags: [Admin]
 *     summary: Crear un nuevo usuario cliente
 *     description: Crea usuario, suscripción, customer en Stripe y envía correo con link de pago
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - full_name
 *               - email
 *               - password
 *               - plan_id
 *               - period_end_date
 *             properties:
 *               full_name:
 *                 type: string
 *                 example: Juan Pérez
 *               email:
 *                 type: string
 *                 format: email
 *                 example: juan@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: MiPassword123
 *               plan_id:
 *                 type: integer
 *                 example: 1
 *               period_end_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-06-04"
 *     responses:
 *       201:
 *         description: Usuario creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 userId:
 *                   type: integer
 *                 checkoutUrl:
 *                   type: string
 *       400:
 *         description: Datos inválidos o faltantes
 */
router.post('/users', adminAuth, adminController.createUser);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: Obtener listado de usuarios
 *     description: Retorna lista paginada de usuarios con filtros
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Buscar por nombre o email
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *       - in: query
 *         name: subscription_status
 *         schema:
 *           type: string
 *           enum: [active, past_due, cancelled, expired, trialing]
 *     responses:
 *       200:
 *         description: Lista paginada de usuarios
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AdminUser'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 */
router.get('/users', adminAuth, adminController.getUsers);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Obtener detalle de un usuario
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detalle del usuario con suscripción y transacciones
 *       404:
 *         description: Usuario no encontrado
 */
router.get('/users/:id', adminAuth, adminController.getUserById);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Activar/desactivar usuario
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               is_active:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Usuario actualizado
 */
router.patch('/users/:id', adminAuth, adminController.updateUser);

// ──────────────────────────────────────────────────────
// SUSCRIPCIONES
// ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/subscriptions:
 *   get:
 *     tags: [Admin]
 *     summary: Obtener listado de suscripciones
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, past_due, cancelled, expired, trialing]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Lista paginada de suscripciones
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AdminSubscription'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 */
router.get('/subscriptions', adminAuth, adminController.getSubscriptions);

/**
 * @swagger
 * /api/admin/subscriptions/{id}/cancel:
 *   patch:
 *     tags: [Admin]
 *     summary: Cancelar una suscripción
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Suscripción cancelada exitosamente
 */
router.patch('/subscriptions/:id/cancel', adminAuth, adminController.cancelSubscription);

/**
 * @swagger
 * /api/admin/subscriptions/{id}/reactivate:
 *   patch:
 *     tags: [Admin]
 *     summary: Reactivar una suscripción cancelada
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Suscripción reactivada exitosamente
 */
router.patch('/subscriptions/:id/reactivate', adminAuth, adminController.reactivateSubscription);

// ──────────────────────────────────────────────────────
// TRANSACCIONES
// ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/transactions:
 *   get:
 *     tags: [Admin]
 *     summary: Obtener listado de transacciones
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, succeeded, failed, refunded]
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Lista paginada de transacciones
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AdminTransaction'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 */
router.get('/transactions', adminAuth, adminController.getTransactions);

/**
 * @swagger
 * /api/admin/transactions/{id}/retry:
 *   post:
 *     tags: [Admin]
 *     summary: Reintentar un cobro fallido
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Cobro reintentado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 status:
 *                   type: string
 *       400:
 *         description: Usuario sin método de pago
 *       404:
 *         description: Transacción no encontrada
 */
router.post('/transactions/:id/retry', adminAuth, adminController.retryTransaction);

module.exports = router;