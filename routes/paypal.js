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
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 approveUrl:
 *                   type: string
 *                   example: https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=xxx
 *                 paypalSubscriptionId:
 *                   type: string
 *                   example: I-ABC123
 *                 subscriptionId:
 *                   type: integer
 *                   example: 5
 *                 message:
 *                   type: string
 *                   example: Se ha enviado un correo con el link de pago
 *                 planName:
 *                   type: string
 *                   example: ESTANDAR
 *                 priceDOP:
 *                   type: number
 *                   example: 250.00
 *                 currencyDOP:
 *                   type: string
 *                   example: DOP
 *       400:
 *         description: Datos inválidos o usuario ya tiene suscripción activa
 *       401:
 *         description: No autorizado
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
 *     description: Recibe eventos de PayPal (pagos, activaciones, cancelaciones, etc.)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Evento de PayPal
 *     responses:
 *       200:
 *         description: Evento recibido y procesado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Webhook no verificado
 */
router.post('/webhook', express.json(), paypalController.paypalWebhook);

/**
 * @swagger
 * /api/paypal/success:
 *   get:
 *     tags: [PayPal]
 *     summary: Retorno exitoso de PayPal
 *     description: Endpoint al que PayPal redirige cuando el usuario completa el pago exitosamente
 *     parameters:
 *       - in: query
 *         name: subscription_id
 *         schema:
 *           type: string
 *         required: true
 *         description: ID de la suscripción en PayPal
 *         example: I-ABC123
 *       - in: query
 *         name: ba_token
 *         schema:
 *           type: string
 *         description: Token de facturación de PayPal
 *         example: BA-123456789
 *     responses:
 *       302:
 *         description: Redirección al frontend con mensaje de éxito
 */
// COMENTADO TEMPORALMENTE - Falta implementar
// router.get('/success', paypalController.paypalSuccess);

/**
 * @swagger
 * /api/paypal/cancel:
 *   get:
 *     tags: [PayPal]
 *     summary: Retorno de cancelación de PayPal
 *     description: Endpoint al que PayPal redirige cuando el usuario cancela el pago
 *     responses:
 *       302:
 *         description: Redirección al frontend con mensaje de cancelación
 */
// COMENTADO TEMPORALMENTE - Falta implementar
// router.get('/cancel', paypalController.paypalCancel);

/**
 * @swagger
 * /api/paypal/subscription/{paypalSubscriptionId}:
 *   get:
 *     tags: [PayPal]
 *     summary: Obtener detalles de una suscripción de PayPal
 *     description: Consulta el estado de una suscripción en PayPal
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paypalSubscriptionId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID de la suscripción en PayPal
 *         example: I-ABC123
 *     responses:
 *       200:
 *         description: Detalles de la suscripción
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 status:
 *                   type: string
 *                 start_time:
 *                   type: string
 *                 billing_info:
 *                   type: object
 *       404:
 *         description: Suscripción no encontrada
 */
// COMENTADO TEMPORALMENTE - Falta implementar
// router.get('/subscription/:paypalSubscriptionId', auth, paypalController.getSubscriptionDetails);

/**
 * @swagger
 * /api/paypal/subscription/{paypalSubscriptionId}/cancel:
 *   post:
 *     tags: [PayPal]
 *     summary: Cancelar suscripción de PayPal
 *     description: Cancela una suscripción activa en PayPal
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paypalSubscriptionId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID de la suscripción en PayPal
 *         example: I-ABC123
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Razón de la cancelación
 *                 example: Usuario solicitó cancelación
 *     responses:
 *       200:
 *         description: Suscripción cancelada exitosamente
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
 *                   example: Suscripción cancelada exitosamente
 *       404:
 *         description: Suscripción no encontrada
 */
// COMENTADO TEMPORALMENTE - Falta implementar
// router.post('/subscription/:paypalSubscriptionId/cancel', auth, paypalController.cancelSubscription);

module.exports = router;