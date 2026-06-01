/**
 * @swagger
 * tags:
 *   name: Referrals
 *   description: Sistema de referidos y comisiones
 *
 * components:
 *   schemas:
 *     ReferralCodeResponse:
 *       type: object
 *       properties:
 *         referral_code:
 *           type: string
 *           example: "REF123"
 *
 *     ReferralStatsResponse:
 *       type: object
 *       properties:
 *         total_referred:
 *           type: integer
 *           example: 5
 *         earnings:
 *           type: object
 *           properties:
 *             pending:
 *               type: number
 *               format: float
 *               example: 125.00
 *             paid:
 *               type: number
 *               format: float
 *               example: 50.00
 *         referred_users:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *               full_name:
 *                 type: string
 *               email:
 *                 type: string
 *               registered_at:
 *                 type: string
 *                 format: date-time
 *               subscription_status:
 *                 type: string
 *                 nullable: true
 *               amount_earned:
 *                 type: number
 *                 format: float
 *               commission_status:
 *                 type: string
 *               commission_date:
 *                 type: string
 *                 format: date-time
 *
 *     AdminReportResponse:
 *       type: object
 *       properties:
 *         report:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               referrer_id:
 *                 type: integer
 *               referrer_name:
 *                 type: string
 *               referrer_email:
 *                 type: string
 *               referral_code:
 *                 type: string
 *               total_referred:
 *                 type: integer
 *               total_earned:
 *                 type: number
 *               pending_payment:
 *                 type: number
 *               already_paid:
 *                 type: number
 *         details:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *               referrer:
 *                 type: string
 *               referrer_email:
 *                 type: string
 *               referral_code:
 *                 type: string
 *               referred_user:
 *                 type: string
 *               referred_email:
 *                 type: string
 *               amount_earned:
 *                 type: number
 *               status:
 *                 type: string
 *               created_at:
 *                 type: string
 *                 format: date-time
 *               paid_at:
 *                 type: string
 *                 format: date-time
 *               plan_name:
 *                 type: string
 *
 *     MarkPaidRequest:
 *       type: object
 *       required:
 *         - earning_ids
 *       properties:
 *         earning_ids:
 *           type: array
 *           items:
 *             type: integer
 *           example: [1, 2, 3]
 *
 *     MarkPaidResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Comisiones marcadas como pagadas"
 */

const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

/**
 * @swagger
 * /api/referrals/my-code:
 *   get:
 *     tags:
 *       - Referrals
 *     summary: Obtener mi código de referido
 *     description: Retorna el código único que el usuario autenticado puede compartir para invitar a otros.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Código obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReferralCodeResponse'
 *       401:
 *         description: No autorizado
 *       404:
 *         description: Usuario no encontrado
 *       500:
 *         description: Error del servidor
 */
router.get('/my-code', auth, referralController.getMyReferralCode);

/**
 * @swagger
 * /api/referrals/my-stats:
 *   get:
 *     tags:
 *       - Referrals
 *     summary: Obtener mis estadísticas de referidos
 *     description: Retorna cantidad de usuarios referidos, ganancias pendientes/pagadas y lista detallada.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas obtenidas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReferralStatsResponse'
 *       401:
 *         description: No autorizado
 *       500:
 *         description: Error del servidor
 */
router.get('/my-stats', auth, referralController.getMyReferralStats);

/**
 * @swagger
 * /api/referrals/admin/report:
 *   get:
 *     tags:
 *       - Referrals
 *     summary: (Admin) Reporte completo de referidos
 *     description: Obtiene un reporte con totales por referente y el detalle de cada comisión generada. Requiere rol de administrador.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reporte generado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminReportResponse'
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso denegado (requiere rol admin)
 *       500:
 *         description: Error del servidor
 */
router.get('/admin/report', auth, adminAuth, referralController.getAdminReferralReport);

/**
 * @swagger
 * /api/referrals/admin/mark-paid:
 *   post:
 *     tags:
 *       - Referrals
 *     summary: (Admin) Marcar comisiones como pagadas
 *     description: Recibe un array de IDs de comisiones (referral_earnings) y cambia su estado a "paid". Requiere rol de administrador.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MarkPaidRequest'
 *     responses:
 *       200:
 *         description: Comisiones actualizadas exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MarkPaidResponse'
 *       400:
 *         description: Error en la solicitud (array vacío o inválido)
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso denegado (requiere rol admin)
 *       500:
 *         description: Error del servidor
 */
router.post('/admin/mark-paid', auth, adminAuth, referralController.markCommissionsAsPaid);

module.exports = router;