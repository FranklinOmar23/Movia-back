const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const groupController = require('../controllers/groupController');

/**
 * @swagger
 * tags:
 *   name: Groups
 *   description: Grupos de películas/series y compartición entre amigos
 */

/**
 * @swagger
 * /api/groups:
 *   post:
 *     tags: [Groups]
 *     summary: Crear un grupo de películas/series
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
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Grupo creado
 */
router.post('/', auth, groupController.createGroup);

/**
 * @swagger
 * /api/groups:
 *   get:
 *     tags: [Groups]
 *     summary: Obtener grupos propios
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de grupos
 */
router.get('/', auth, groupController.getMyGroups);

/**
 * @swagger
 * /api/groups/shared:
 *   get:
 *     tags: [Groups]
 *     summary: Obtener grupos compartidos contigo
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Grupos compartidos
 */
router.get('/shared', auth, groupController.getSharedWithMe);

/**
 * @swagger
 * /api/groups/{groupId}:
 *   get:
 *     tags: [Groups]
 *     summary: Obtener detalle de un grupo
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detalle del grupo con items y permisos
 */
router.get('/:groupId', auth, groupController.getGroupById);

/**
 * @swagger
 * /api/groups/{groupId}/items:
 *   post:
 *     tags: [Groups]
 *     summary: Agregar una película/serie a un grupo
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tmdb_id
 *               - media_type
 *             properties:
 *               tmdb_id:
 *                 type: integer
 *               media_type:
 *                 type: string
 *               title:
 *                 type: string
 *               poster_path:
 *                 type: string
 *     responses:
 *       201:
 *         description: Item agregado al grupo
 */
router.post('/:groupId/items', auth, groupController.addItem);

/**
 * @swagger
 * /api/groups/{groupId}/items/{itemId}:
 *   delete:
 *     tags: [Groups]
 *     summary: Eliminar una película/serie de un grupo
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Item eliminado del grupo
 */
router.delete('/:groupId/items/:itemId', auth, groupController.removeItem);

/**
 * @swagger
 * /api/groups/{groupId}/share:
 *   post:
 *     tags: [Groups]
 *     summary: Compartir un grupo con un amigo
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - friend_id
 *             properties:
 *               friend_id:
 *                 type: integer
 *               can_edit:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Grupo compartido
 */
router.post('/:groupId/share', auth, groupController.shareGroup);

// Actualizar grupo (PATCH /api/groups/:groupId)
router.patch('/:groupId', auth, groupController.updateGroup);

// Actualizar permiso (can_edit)
router.patch('/:groupId/share/:shareId', auth, groupController.updateGroupShare);

// Eliminar permiso
router.delete('/:groupId/share/:shareId', auth, groupController.removeGroupShare);
router.get('/public', auth, groupController.getPublicGroups);

module.exports = router;
