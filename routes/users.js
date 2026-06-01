const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const userController = require('../controllers/userController');

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Búsqueda, perfil, estado y gestión de amigos
 */

/**
 * @swagger
 * /api/users/status:
 *   get:
 *     tags: [Users]
 *     summary: Obtener estado activo del usuario autenticado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estado del usuario
 */
router.get('/status', auth, userController.getStatus);

/**
 * @swagger
 * /api/users/search:
 *   get:
 *     tags: [Users]
 *     summary: Buscar usuarios por nombre o email
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Resultados de búsqueda de usuarios
 */
router.get('/search', auth, userController.searchUsers);

/**
 * @swagger
 * /api/users/friends/request:
 *   post:
 *     tags: [Users]
 *     summary: Enviar solicitud de amistad
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - target_user_id
 *             properties:
 *               target_user_id:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Solicitud enviada
 */
router.post('/friends/request', auth, userController.sendFriendRequest);

/**
 * @swagger
 * /api/users/friends/requests/received:
 *   get:
 *     tags: [Users]
 *     summary: Obtener solicitudes de amistad recibidas
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de solicitudes recibidas
 */
router.get('/friends/requests/received', auth, userController.getReceivedRequests);

/**
 * @swagger
 * /api/users/friends/requests/sent:
 *   get:
 *     tags: [Users]
 *     summary: Obtener solicitudes de amistad enviadas
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de solicitudes enviadas
 */
router.get('/friends/requests/sent', auth, userController.getSentRequests);

/**
 * @swagger
 * /api/users/friends:
 *   get:
 *     tags: [Users]
 *     summary: Obtener lista de amigos aceptados
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de amigos
 */
router.get('/friends', auth, userController.getFriends);

/**
 * @swagger
 * /api/users/friends/{requestId}/accept:
 *   post:
 *     tags: [Users]
 *     summary: Aceptar solicitud de amistad
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Solicitud aceptada
 */
router.post('/friends/:requestId/accept', auth, userController.acceptFriendRequest);

/**
 * @swagger
 * /api/users/friends/{requestId}/reject:
 *   post:
 *     tags: [Users]
 *     summary: Rechazar solicitud de amistad
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Solicitud rechazada
 */
router.post('/friends/:requestId/reject', auth, userController.rejectFriendRequest);

module.exports = router;
