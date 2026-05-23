/**
 * @swagger
 * tags:
 *   name: Watchlist
 *   description: Lista de "Ver más tarde"
 */

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const watchlistController = require('../controllers/watchlistController');

/**
 * @swagger
 * /api/watchlist:
 *   get:
 *     tags: [Watchlist]
 *     summary: Obtener watchlist del usuario
 *     description: Retorna todos los items guardados en "Ver más tarde"
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
 *         description: Lista de items en watchlist
 */
router.get('/', auth, watchlistController.getWatchlist);

/**
 * @swagger
 * /api/watchlist:
 *   post:
 *     tags: [Watchlist]
 *     summary: Agregar a "Ver más tarde"
 *     security:
 *       - bearerAuth: []
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
 *                 enum: [movie, tv]
 *               title:
 *                 type: string
 *               poster_path:
 *                 type: string
 *     responses:
 *       201:
 *         description: Agregado a watchlist
 *       409:
 *         description: Ya está en la watchlist
 */
router.post('/', auth, watchlistController.addToWatchlist);

/**
 * @swagger
 * /api/watchlist/{mediaType}/{tmdbId}:
 *   delete:
 *     tags: [Watchlist]
 *     summary: Quitar de "Ver más tarde"
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
 *         description: Eliminado de watchlist
 */
router.delete('/:mediaType/:tmdbId', auth, watchlistController.removeFromWatchlist);

/**
 * @swagger
 * /api/watchlist/check/{mediaType}/{tmdbId}:
 *   get:
 *     tags: [Watchlist]
 *     summary: Verificar si un item está en la watchlist
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
 *         description: Estado del item
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 inWatchlist:
 *                   type: boolean
 */
router.get('/check/:mediaType/:tmdbId', auth, watchlistController.checkWatchlist);

module.exports = router;