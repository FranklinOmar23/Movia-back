/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Gestión de usuarios y operaciones administrativas
 */

const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminController = require('../controllers/adminController');

/**
 * @swagger
 * /api/admin/users:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Crear un nuevo usuario
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserRequest'
 *     responses:
 *       201:
 *         description: Usuario creado correctamente
 *       401:
 *         description: No autorizado
 */
router.post('/users', adminAuth, adminController.createUser);

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Obtener listado de usuarios
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuarios
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserResponse'
 *       401:
 *         description: No autorizado
 */
router.get('/users', adminAuth, adminController.getUsers);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   put:
 *     tags:
 *       - Admin
 *     summary: Actualizar un usuario existente
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario a actualizar
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserRequest'
 *     responses:
 *       200:
 *         description: Usuario actualizado
 *       401:
 *         description: No autorizado
 */
router.put('/users/:id', adminAuth, adminController.updateUser);

module.exports = router;