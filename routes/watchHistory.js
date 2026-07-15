/**
 * @swagger
 * tags:
 *   name: Watch History
 *   description: Historial de reproducción y watchlist
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const watchHistoryController = require('../controllers/watchHistoryController');

/**
 * @swagger
 * /api/watch-history/continue-watching:
 *   get:
 *     tags: [Watch History]
 *     summary: Obtener lista de "Continuar Viendo"
 *     description: Retorna los últimos contenidos vistos por el usuario con progreso < 95%
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Cantidad de items
 *     responses:
 *       200:
 *         description: Lista de contenidos en progreso
 */
router.get('/continue-watching', auth, watchHistoryController.getContinueWatching);

/**
 * @swagger
 * /api/watch-history/progress/{mediaType}/{tmdbId}:
 *   get:
 *     tags: [Watch History]
 *     summary: Obtener progreso guardado de un contenido específico
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mediaType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [movie, tv]
 *       - in: path
 *         name: tmdbId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Progreso guardado
 */
router.get('/progress/:mediaType/:tmdbId', auth, watchHistoryController.getProgress);

/**
 * @swagger
 * /api/watch-history:
 *   post:
 *     tags: [Watch History]
 *     summary: Guardar o actualizar progreso de reproducción
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tmdbId
 *               - mediaType
 *               - progressPct
 *               - progressSeconds
 *             properties:
 *               tmdbId:
 *                 type: integer
 *               mediaType:
 *                 type: string
 *                 enum: [movie, tv]
 *               progressPct:
 *                 type: integer
 *               progressSeconds:
 *                 type: integer
 *               season:
 *                 type: integer
 *               episode:
 *                 type: integer
 *               durationSeconds:
 *                 type: integer
 *               title:
 *                 type: string
 *               posterPath:
 *                 type: string
 *               genreIds:
 *                 type: string
 *                 description: JSON array de IDs de géneros
 *     responses:
 *       200:
 *         description: Progreso guardado
 */
router.post('/', auth, watchHistoryController.saveProgress);

/**
 * @swagger
 * /api/watch-history/{mediaType}/{tmdbId}:
 *   delete:
 *     tags: [Watch History]
 *     summary: Eliminar un contenido del historial
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mediaType
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: tmdbId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Eliminado del historial
 */
router.delete('/:mediaType/:tmdbId', auth, watchHistoryController.deleteFromHistory);

/**
 * @swagger
 * /api/watch-history/top-genres:
 *   get:
 *     tags: [Watch History]
 *     summary: Obtener géneros más vistos por el usuario
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 3
 *     responses:
 *       200:
 *         description: Lista de géneros más vistos
 */
router.get('/top-genres', auth, watchHistoryController.getTopGenres);

/**
 * @swagger
 * /api/watch-history/all:
 *   get:
 *     tags: [Watch History]
 *     summary: Obtener todo el historial del usuario
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Historial paginado
 */
router.get('/all', auth, watchHistoryController.getAllHistory);

/**
 * @swagger
 * /api/watch-history/next-episode/{tvId}/{season}/{episode}:
 *   get:
 *     tags: [Watch History]
 *     summary: Obtener datos del siguiente episodio de una serie
 *     description: Dado el episodio actual, devuelve el siguiente (o el episodio 1 de la siguiente temporada si era el último de la temporada actual). Usado para el popup de auto-avance.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tvId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: season
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: episode
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Datos del siguiente episodio, o hasNext=false si era el final de la serie
 *       404:
 *         description: Temporada no encontrada
 */
router.get('/next-episode/:tvId/:season/:episode', auth, watchHistoryController.getNextEpisode);

/**
 * @swagger
 * /api/watch-history/stats:
 *   get:
 *     tags: [Watch History]
 *     summary: Obtener estadísticas de visualización del usuario
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Resumen de tiempo visto, títulos completados/en progreso y desglose por tipo
 */
router.get('/stats', auth, watchHistoryController.getWatchStats);

module.exports = router;