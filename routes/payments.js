/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Operaciones de pago y Stripe
 */

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const adminAuth = require('../middleware/adminAuth');

/**
 * @swagger
 * /api/payments/create-checkout-session:
 *   post:
 *     tags:
 *       - Payments
 *     summary: Crear sesión de pago de Stripe
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: URL de checkout creada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CheckoutSessionResponse'
 *       401:
 *         description: No autorizado
 */
router.post('/create-checkout-session', adminAuth, paymentController.createCheckoutSession);

/**
 * @swagger
 * /api/payments/webhook:
 *   post:
 *     tags:
 *       - Payments
 *     summary: Recibir eventos de Stripe (webhook)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Evento procesado correctamente
 */
router.post('/webhook', express.raw({ type: 'application/json' }), paymentController.webhook);

module.exports = router;