/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Panel de administración - Gestión de usuarios, suscripciones y transacciones
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
 *     description: Retorna totalUsers, activeUsers, activeSubscriptions, mrr, pendingPayments, failedPayments
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
 *                 activeSubscriptions:
 *                   type: integer
 *                   example: 100
 *                 mrr:
 *                   type: number
 *                   example: 799.00
 *                 pendingPayments:
 *                   type: integer
 *                   example: 5
 *                 failedPayments:
 *                   type: integer
 *                   example: 3
 *       401:
 *         description: No autorizado - Token inválido o no proporcionado
 *       403:
 *         description: Prohibido - No tiene rol de administrador
 */
router.get('/stats', adminAuth, adminController.getStats);

// ──────────────────────────────────────────────────────
// USUARIOS
// ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/admin/users:
 *   post:
 *     tags: [Admin]
 *     summary: Crear un nuevo usuario cliente
 *     description: Crea un usuario, asigna suscripción, crea cliente en Stripe y envía correo con link de pago
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
 *                   example: Usuario creado exitosamente
 *                 userId:
 *                   type: integer
 *                   example: 10
 *                 checkoutUrl:
 *                   type: string
 *                   example: https://checkout.stripe.com/c/pay/cs_test_xxx
 *       400:
 *         description: Datos inválidos o faltantes
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido - No tiene rol de administrador
 */
router.post('/users', adminAuth, adminController.createUser);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: Obtener listado de usuarios
 *     description: Retorna lista paginada de usuarios con filtros opcionales
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Usuarios por página
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
 *         description: Filtrar por estado del usuario
 *       - in: query
 *         name: subscription_status
 *         schema:
 *           type: string
 *           enum: [active, past_due, cancelled, expired, trialing]
 *         description: Filtrar por estado de suscripción
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
 *                   example: 150
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 totalPages:
 *                   type: integer
 *                   example: 15
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido - No tiene rol de administrador
 */
router.get('/users', adminAuth, adminController.getUsers);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Obtener detalle de un usuario
 *     description: Retorna datos del usuario, su suscripción y últimas transacciones
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario
 *     responses:
 *       200:
 *         description: Detalle del usuario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 full_name:
 *                   type: string
 *                 email:
 *                   type: string
 *                 role:
 *                   type: string
 *                 is_active:
 *                   type: boolean
 *                 subscription_id:
 *                   type: integer
 *                 plan_name:
 *                   type: string
 *                 price:
 *                   type: number
 *                 sub_status:
 *                   type: string
 *                 card_brand:
 *                   type: string
 *                 card_last4:
 *                   type: string
 *                 transactions:
 *                   type: array
 *                   items:
 *                     type: object
 *       404:
 *         description: Usuario no encontrado
 *       401:
 *         description: No autorizado
 */
router.get('/users/:id', adminAuth, adminController.getUserById);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Actualizar estado de un usuario
 *     description: Activar o desactivar un usuario (is_active)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario
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
 *         description: Usuario actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Usuario actualizado exitosamente
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido - No tiene rol de administrador
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
 *     description: Retorna lista paginada de suscripciones con filtro por estado
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, past_due, cancelled, expired, trialing]
 *         description: Filtrar por estado de suscripción
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Suscripciones por página
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
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido - No tiene rol de administrador
 */
router.get('/subscriptions', adminAuth, adminController.getSubscriptions);

/**
 * @swagger
 * /api/admin/subscriptions/{id}/cancel:
 *   patch:
 *     tags: [Admin]
 *     summary: Cancelar una suscripción
 *     description: Marca la suscripción como cancelada
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la suscripción
 *     responses:
 *       200:
 *         description: Suscripción cancelada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Suscripción cancelada exitosamente
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido - No tiene rol de administrador
 */
router.patch('/subscriptions/:id/cancel', adminAuth, adminController.cancelSubscription);

/**
 * @swagger
 * /api/admin/subscriptions/{id}/reactivate:
 *   patch:
 *     tags: [Admin]
 *     summary: Reactivar una suscripción cancelada
 *     description: Vuelve a activar una suscripción previamente cancelada
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la suscripción
 *     responses:
 *       200:
 *         description: Suscripción reactivada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Suscripción reactivada exitosamente
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido - No tiene rol de administrador
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
 *     description: Retorna lista paginada de transacciones con filtros
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, succeeded, failed, refunded]
 *         description: Filtrar por estado de transacción
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
 *         description: Filtrar por ID de usuario
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Transacciones por página
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
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido - No tiene rol de administrador
 */
router.get('/transactions', adminAuth, adminController.getTransactions);

/**
 * @swagger
 * /api/admin/transactions/{id}/retry:
 *   post:
 *     tags: [Admin]
 *     summary: Reintentar un cobro fallido
 *     description: Reintenta el cobro de una transacción que falló
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la transacción a reintentar
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
 *                   example: Cobro reintentado
 *                 status:
 *                   type: string
 *                   example: succeeded
 *       400:
 *         description: Usuario sin método de pago
 *       404:
 *         description: Transacción no encontrada
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Prohibido - No tiene rol de administrador
 */
router.post('/transactions/:id/retry', adminAuth, adminController.retryTransaction);

module.exports = router;