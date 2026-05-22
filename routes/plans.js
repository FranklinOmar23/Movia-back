/**
 * @swagger
 * tags:
 *   name: Plans
 *   description: Planes de suscripción disponibles
 */

const express = require('express');
const router = express.Router();
const plansController = require('../controllers/plansController');

/**
 * @swagger
 * /api/plans:
 *   get:
 *     tags: [Plans]
 *     summary: Obtener planes activos (público)
 *     description: Retorna todos los planes de suscripción disponibles para nuevos usuarios
 *     responses:
 *       200:
 *         description: Lista de planes activos
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
router.get('/', plansController.getActivePlans);

/**
 * @swagger
 * /api/plans/{id}:
 *   get:
 *     tags: [Plans]
 *     summary: Obtener detalle de un plan (público)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detalle del plan
 *       404:
 *         description: Plan no encontrado
 */
router.get('/:id', plansController.getPlanById);

module.exports = router;