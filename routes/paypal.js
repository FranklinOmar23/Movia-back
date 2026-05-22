/**
 * @swagger
 * tags:
 *   name: PayPal
 *   description: Operaciones de pago con PayPal
 */

const express = require('express');
const router = express.Router();
const paypalController = require('../controllers/paypalController');
const auth = require('../middleware/auth');

/**
 * @swagger
 * /api/paypal/create-subscription:
 *   post:
 *     tags: [PayPal]
 *     summary: Crear suscripción de PayPal para un usuario
 *     description: Crea una suscripción en PayPal y devuelve la URL de aprobación
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
 *               - planId
 *             properties:
 *               userId:
 *                 type: integer
 *                 description: ID del usuario
 *                 example: 1
 *               planId:
 *                 type: integer
 *                 description: ID del plan de suscripción
 *                 example: 1
 *     responses:
 *       200:
 *         description: URL de aprobación de PayPal
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 approveUrl:
 *                   type: string
 *                   example: https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=xxx
 *                 paypalSubscriptionId:
 *                   type: string
 *                   example: I-ABC123
 *                 message:
 *                   type: string
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: Usuario o plan no encontrado
 */
router.post('/create-subscription', auth, paypalController.createPayPalSubscription);

/**
 * @swagger
 * /api/paypal/webhook:
 *   post:
 *     tags: [PayPal]
 *     summary: Webhook de PayPal
 *     description: Recibe eventos de PayPal (pagos, activaciones, cancelaciones)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Evento recibido
 *       400:
 *         description: Webhook no verificado
 */
router.post('/webhook', express.json(), paypalController.paypalWebhook);

module.exports = router;