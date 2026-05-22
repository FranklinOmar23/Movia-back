/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Operaciones de pago y Stripe
 */

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const auth = require('../middleware/auth');

/**
 * @swagger
 * /api/payments/create-checkout-session:
 *   post:
 *     tags: [Payments]
 *     summary: Crear sesión de pago para nueva tarjeta
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: URL de checkout
 */
router.post('/create-checkout-session', auth, paymentController.createCheckoutSession);

/**
 * @swagger
 * /api/payments/reactivate-subscription:
 *   post:
 *     tags: [Payments]
 *     summary: Reactivar suscripción (autopago si tiene tarjeta, o link para nueva)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Resultado de la reactivación
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 autoCharged:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 url:
 *                   type: string
 *                 cardLast4:
 *                   type: string
 */
router.post('/reactivate-subscription', auth, paymentController.reactivateSubscription);

/**
 * @swagger
 * /api/payments/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: Webhook de Stripe (eventos de pago)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Evento recibido
 */
router.post('/webhook', express.raw({ type: 'application/json' }), paymentController.webhook);

module.exports = router;