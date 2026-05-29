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
 *     description: Retorna KPIs globales + series históricas para gráficos (MRR, registros, distribución de suscripciones)
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
 *                   example: 1250
 *                 activeUsers:
 *                   type: integer
 *                   example: 980
 *                 activeSubscriptions:
 *                   type: integer
 *                   example: 340
 *                 mrr:
 *                   type: number
 *                   example: 2500.00
 *                 pendingPayments:
 *                   type: integer
 *                   example: 12
 *                 failedPayments:
 *                   type: integer
 *                   example: 4
 *                 mrrHistory:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       label:
 *                         type: string
 *                         example: Ene
 *                       value:
 *                         type: number
 *                         example: 1800
 *                 userRegistrations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       label:
 *                         type: string
 *                         example: Ene
 *                       count:
 *                         type: integer
 *                         example: 120
 *                 subscriptionDistribution:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       label:
 *                         type: string
 *                         example: Activas
 *                       value:
 *                         type: integer
 *                         example: 340
 *       401:
 *         description: No autorizado
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
// USUARIOS — stats ANTES que /:id para evitar conflicto
// ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/users/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Estadísticas de usuarios
 *     description: Registros mensuales de los últimos 6 meses y distribución de usuarios por plan
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas de usuarios
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 registrations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       label:
 *                         type: string
 *                         example: Ene
 *                       count:
 *                         type: integer
 *                         example: 120
 *                 planDistribution:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       label:
 *                         type: string
 *                         example: Básico
 *                       value:
 *                         type: integer
 *                         example: 450
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido - No tiene rol de administrador
 */
router.get('/users/stats', adminAuth, adminController.getUserStats); // ✅ ANTES de /users/:id

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
router.get('/users/:id', adminAuth, adminController.getUserById); // ✅ DESPUÉS de /users/stats

/**
 * @swagger
 * /api/admin/users/{id}/watchlist:
 *   get:
 *     tags: [Admin]
 *     summary: Obtener watchlist de un usuario
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
 *         description: Lista de items en watchlist del usuario
 */
router.get('/users/:id/watchlist', adminAuth, adminController.getUserWatchlist);

/**
 * @swagger
 * /api/admin/users/{id}/watch-history:
 *   get:
 *     tags: [Admin]
 *     summary: Obtener historial de reproducción de un usuario
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
 *         description: Historial de reproducciones del usuario
 */
router.get('/users/:id/watch-history', adminAuth, adminController.getUserWatchHistory);

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
// SUSCRIPCIONES — stats ANTES que /:id
// ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/subscriptions/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Estadísticas de suscripciones
 *     description: Distribución por estado y comparativa mensual de activas vs canceladas (últimos 6 meses)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas de suscripciones
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusDistribution:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       label:
 *                         type: string
 *                         example: Activas
 *                       value:
 *                         type: integer
 *                         example: 340
 *                 monthlyComparison:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       label:
 *                         type: string
 *                         example: Ene
 *                       active:
 *                         type: integer
 *                         example: 280
 *                       cancelled:
 *                         type: integer
 *                         example: 20
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido - No tiene rol de administrador
 */
router.get('/subscriptions/stats', adminAuth, adminController.getSubscriptionStats); // ✅ ANTES de /:id

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
// TRANSACCIONES — stats ANTES que /:id
// ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/transactions/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Estadísticas de transacciones
 *     description: Volumen mensual total y comparativa de transacciones exitosas vs fallidas (últimos 6 meses)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas de transacciones
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 volumeHistory:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       label:
 *                         type: string
 *                         example: Ene
 *                       count:
 *                         type: integer
 *                         example: 450
 *                 successFailure:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       label:
 *                         type: string
 *                         example: Ene
 *                       succeeded:
 *                         type: integer
 *                         example: 420
 *                       failed:
 *                         type: integer
 *                         example: 30
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido - No tiene rol de administrador
 */
router.get('/transactions/stats', adminAuth, adminController.getTransactionStats); // ✅ ANTES de /:id

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

/**
 * @swagger
 * /api/admin/users/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Actualizar datos de un usuario
 *     description: Permite al administrador actualizar uno o varios campos de un usuario. Todos los campos son opcionales.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario a actualizar
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *                 description: Nombre completo del usuario
 *                 example: Juan Pérez
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Correo electrónico del usuario
 *                 example: juan.perez@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 description: Nueva contraseña (mínimo 6 caracteres)
 *                 example: NuevaPassword123
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *                 description: Rol del usuario
 *                 example: user
 *               is_active:
 *                 type: boolean
 *                 description: Estado activo/inactivo del usuario
 *                 example: true
 *     responses:
 *       200:
 *         description: Usuario actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Usuario actualizado exitosamente
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     full_name:
 *                       type: string
 *                       example: Juan Pérez
 *                     email:
 *                       type: string
 *                       example: juan.perez@example.com
 *                     role:
 *                       type: string
 *                       example: user
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Datos inválidos o sin campos para actualizar
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: La contraseña debe tener al menos 6 caracteres
 *       404:
 *         description: Usuario no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Usuario no encontrado
 *       409:
 *         description: El email ya está en uso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: El email ya está en uso
 *       500:
 *         description: Error del servidor
 */
router.patch('/users/:id', adminAuth, adminController.updateUser);

/**
 * @swagger
 * /api/admin/users/{id}/payment-reminder:
 *   post:
 *     tags: [Admin]
 *     summary: Enviar recordatorio de pago a usuario inactivo
 *     description: Envía un correo al usuario recordándole que complete su pago para activar la cuenta
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario
 *         example: 5
 *     responses:
 *       200:
 *         description: Recordatorio enviado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Recordatorio enviado exitosamente a juan@example.com
 *       400:
 *         description: El usuario ya está activo o no tiene suscripción pendiente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: El usuario ya tiene la cuenta activa
 *       404:
 *         description: Usuario no encontrado
 *       500:
 *         description: Error al enviar recordatorio
 */
router.post('/users/:id/payment-reminder', adminAuth, adminController.sendPaymentReminder);

module.exports = router;