const pool = require('../db');
const axios = require('axios');

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.TMDB_API_KEY;
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p';

/**
 * GET /api/watch-history/continue-watching
 * Obtener contenidos con progreso entre 5% y 95% (no terminados)
 */
exports.getContinueWatching = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    // Se deduplica por (tmdb_id, media_type) quedándonos con la fila más
    // reciente: datos históricos pueden tener filas duplicadas por content
    // (ver saveProgress) y sin esto un mismo título podía aparecer dos veces
    // o esconder el progreso real detrás de una fila vieja.
    const [items] = await pool.query(`
      SELECT
        wh.tmdb_id,
        wh.media_type,
        wh.progress_pct,
        wh.progress_seconds,
        wh.season,
        wh.episode,
        wh.duration_seconds,
        wh.title,
        wh.poster_path,
        wh.last_watched
      FROM (
        SELECT wh.*,
          ROW_NUMBER() OVER (
            PARTITION BY wh.tmdb_id, wh.media_type
            ORDER BY wh.last_watched DESC, wh.id DESC
          ) AS rn
        FROM watch_history wh
        WHERE wh.user_id = ?
      ) wh
      WHERE wh.rn = 1
        AND wh.progress_pct >= 1
        AND wh.progress_pct < 95
      ORDER BY wh.last_watched DESC
      LIMIT ?
    `, [userId, limit]);

    res.json(items);
  } catch (error) {
    console.error('❌ Error en getContinueWatching:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
};

/**
 * GET /api/watch-history/progress/:mediaType/:tmdbId
 * Obtener progreso de un contenido específico
 */
exports.getProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { mediaType, tmdbId } = req.params;

    const [rows] = await pool.query(`
      SELECT
        progress_pct,
        progress_seconds,
        season,
        episode,
        duration_seconds,
        last_watched
      FROM watch_history
      WHERE user_id = ? AND tmdb_id = ? AND media_type = ?
      ORDER BY last_watched DESC
      LIMIT 1
    `, [userId, tmdbId, mediaType]);

    if (rows.length === 0) {
      return res.json({
        progress_pct: 0,
        progress_seconds: 0,
        season: null,
        episode: null
      });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('❌ Error en getProgress:', error);
    res.status(500).json({ error: 'Error al obtener progreso' });
  }
};

/**
 * POST /api/watch-history
 * Guardar o actualizar progreso de reproducción
 */
exports.saveProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      tmdbId,
      mediaType,
      progressPct,
      progressSeconds,
      season = null,
      episode = null,
      durationSeconds = null,
      title = null,
      posterPath = null,
      genreIds = null
    } = req.body;

    if (!tmdbId || !mediaType || progressPct === undefined || progressSeconds === undefined) {
      return res.status(400).json({ error: 'Faltan campos requeridos: tmdbId, mediaType, progressPct, progressSeconds' });
    }

    // ─── Convertir genreIds a JSON válido ───
    let genreIdsJson = null;
    if (genreIds) {
      try {
        // Si ya es un string JSON (empieza con '[')
        if (typeof genreIds === 'string' && genreIds.trim().startsWith('[')) {
          genreIdsJson = genreIds;
        }
        // Si es string separado por comas: "28,80,53"
        else if (typeof genreIds === 'string' && genreIds.includes(',')) {
          const idsArray = genreIds.split(',').map(id => parseInt(id.trim(), 10));
          genreIdsJson = JSON.stringify(idsArray);
        }
        // Si es un solo número como string: "28"
        else if (typeof genreIds === 'string') {
          genreIdsJson = JSON.stringify([parseInt(genreIds, 10)]);
        }
        // Si ya es un array
        else if (Array.isArray(genreIds)) {
          genreIdsJson = JSON.stringify(genreIds);
        }
      } catch (e) {
        console.error('⚠️ Error convirtiendo genreIds:', e.message);
        genreIdsJson = null;
      }
    }

    console.log(`📝 Guardando progreso para usuario ${userId}:`);
    console.log(`   tmdbId: ${tmdbId}, mediaType: ${mediaType}`);
    console.log(`   progress: ${progressPct}% (${progressSeconds}s)`);
    console.log(`   genreIds original: ${genreIds} → JSON: ${genreIdsJson}`);

    // Verificar si ya existe (la más reciente primero — puede haber duplicados
    // heredados de antes de que existiera esta protección; ver limpieza abajo)
    const [existing] = await pool.query(
      'SELECT id FROM watch_history WHERE user_id = ? AND tmdb_id = ? AND media_type = ? ORDER BY last_watched DESC, id DESC',
      [userId, tmdbId, mediaType]
    );

    if (existing.length > 0) {
      // Actualizar el registro más reciente
      await pool.query(`
        UPDATE watch_history
        SET progress_pct = ?,
            progress_seconds = ?,
            season = ?,
            episode = ?,
            duration_seconds = ?,
            title = COALESCE(?, title),
            poster_path = COALESCE(?, poster_path),
            genre_ids = COALESCE(?, genre_ids),
            last_watched = NOW()
        WHERE id = ?
      `, [
        progressPct,
        progressSeconds,
        season,
        episode,
        durationSeconds,
        title,
        posterPath,
        genreIdsJson,
        existing[0].id
      ]);
      console.log(`   ✅ Registro actualizado (id: ${existing[0].id})`);

      // Auto-limpieza: si había duplicados de user_id+tmdb_id+media_type
      // (bug histórico sin constraint UNIQUE), eliminar los sobrantes para
      // que futuras lecturas sean siempre consistentes.
      if (existing.length > 1) {
        const staleIds = existing.slice(1).map(r => r.id);
        await pool.query('DELETE FROM watch_history WHERE id IN (?)', [staleIds]);
        console.log(`   🧹 Duplicados eliminados (ids: ${staleIds.join(', ')})`);
      }
    } else {
      // Insertar nuevo registro
      const [result] = await pool.query(`
        INSERT INTO watch_history 
        (user_id, tmdb_id, media_type, progress_pct, progress_seconds, season, episode, duration_seconds, title, poster_path, genre_ids)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        tmdbId,
        mediaType,
        progressPct,
        progressSeconds,
        season,
        episode,
        durationSeconds,
        title,
        posterPath,
        genreIdsJson
      ]);
      console.log(`   ✅ Nuevo registro creado (id: ${result.insertId})`);
    }

    res.json({ message: 'Progreso guardado exitosamente' });
  } catch (error) {
    console.error('❌ Error en saveProgress:', error);
    res.status(500).json({ error: 'Error al guardar progreso' });
  }
};

/**
 * DELETE /api/watch-history/:mediaType/:tmdbId
 * Eliminar del historial
 */
exports.deleteFromHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { mediaType, tmdbId } = req.params;

    await pool.query(
      'DELETE FROM watch_history WHERE user_id = ? AND tmdb_id = ? AND media_type = ?',
      [userId, tmdbId, mediaType]
    );

    res.json({ message: 'Eliminado del historial' });
  } catch (error) {
    console.error('❌ Error en deleteFromHistory:', error);
    res.status(500).json({ error: 'Error al eliminar del historial' });
  }
};

/**
 * GET /api/watch-history/top-genres
 * Obtener géneros más vistos
 */
exports.getTopGenres = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 3;

    // Usar JSON_TABLE para extraer genre_ids del JSON
    const [genres] = await pool.query(`
      SELECT
        jt.genre_id,
        COUNT(*) AS watch_count
      FROM watch_history wh,
        JSON_TABLE(wh.genre_ids, '$[*]' COLUMNS (genre_id INT PATH '$')) AS jt
      WHERE wh.user_id = ?
        AND wh.genre_ids IS NOT NULL
      GROUP BY jt.genre_id
      ORDER BY watch_count DESC
      LIMIT ?
    `, [userId, limit]);

    // Mapear IDs a nombres de géneros
    const genreNames = {
      28: 'Acción',
      12: 'Aventura',
      16: 'Animación',
      35: 'Comedia',
      80: 'Crimen',
      99: 'Documental',
      18: 'Drama',
      10751: 'Familia',
      14: 'Fantasía',
      36: 'Historia',
      27: 'Terror',
      10402: 'Música',
      9648: 'Misterio',
      10749: 'Romance',
      878: 'Ciencia ficción',
      10770: 'Película de TV',
      53: 'Suspense',
      10752: 'Bélica',
      37: 'Western'
    };

    const result = genres.map(g => ({
      genre_id: g.genre_id,
      genre_name: genreNames[g.genre_id] || `Género ${g.genre_id}`,
      watch_count: g.watch_count
    }));

    res.json(result);
  } catch (error) {
    console.error('❌ Error en getTopGenres:', error);
    // Si falla JSON_TABLE (MySQL < 8.0), devolver array vacío
    res.json([]);
  }
};

/**
 * GET /api/watch-history/all
 * Obtener todo el historial paginado
 */
exports.getAllHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM watch_history WHERE user_id = ?',
      [userId]
    );

    const [items] = await pool.query(`
      SELECT *
      FROM watch_history
      WHERE user_id = ?
      ORDER BY last_watched DESC
      LIMIT ? OFFSET ?
    `, [userId, limit, offset]);

    res.json({
      data: items,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('❌ Error en getAllHistory:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
};

/**
 * GET /api/watch-history/next-episode/:tvId/:season/:episode
 * Dado el episodio actual de una serie, devuelve los datos del siguiente
 * episodio (misma temporada, o el episodio 1 de la siguiente temporada si
 * el actual era el último). Usado por el frontend para el popup de
 * "siguiente episodio" con auto-avance.
 */
exports.getNextEpisode = async (req, res) => {
  try {
    const tvId = Number(req.params.tvId);
    const season = Number(req.params.season);
    const episode = Number(req.params.episode);

    if (!tvId || !season || !episode) {
      return res.status(400).json({ error: 'tvId, season y episode son requeridos' });
    }

    const fetchSeason = async (seasonNumber) => {
      try {
        const { data } = await axios.get(`${TMDB_BASE}/tv/${tvId}/season/${seasonNumber}`, {
          params: { api_key: TMDB_KEY, language: 'es-ES' }
        });
        return data;
      } catch (err) {
        if (err.response?.status === 404) return null;
        throw err;
      }
    };

    const currentSeasonData = await fetchSeason(season);
    if (!currentSeasonData) {
      return res.status(404).json({ error: 'Temporada no encontrada' });
    }

    const episodes = currentSeasonData.episodes || [];
    const currentIdx = episodes.findIndex(ep => ep.episode_number === episode);

    let nextEpRaw = currentIdx >= 0 && currentIdx < episodes.length - 1
      ? episodes[currentIdx + 1]
      : null;
    let nextSeasonNumber = season;

    // Si era el último episodio de la temporada, buscar el episodio 1 de la siguiente
    if (!nextEpRaw) {
      const nextSeasonData = await fetchSeason(season + 1);
      if (nextSeasonData?.episodes?.length) {
        nextEpRaw = nextSeasonData.episodes[0];
        nextSeasonNumber = season + 1;
      }
    }

    if (!nextEpRaw) {
      return res.json({ hasNext: false });
    }

    res.json({
      hasNext: true,
      nextEpisode: {
        tvId,
        season: nextSeasonNumber,
        episode: nextEpRaw.episode_number,
        episodeId: nextEpRaw.id,
        name: nextEpRaw.name || `Episodio ${nextEpRaw.episode_number}`,
        overview: nextEpRaw.overview || '',
        airDate: nextEpRaw.air_date || null,
        runtime: nextEpRaw.runtime || null,
        thumbnailPath: nextEpRaw.still_path || null,
        thumbnailUrl: nextEpRaw.still_path ? `${TMDB_IMG_BASE}/w300${nextEpRaw.still_path}` : null
      }
    });
  } catch (error) {
    console.error('❌ Error en getNextEpisode:', error.message);
    res.status(500).json({ error: 'Error al obtener el siguiente episodio' });
  }
};

/**
 * GET /api/watch-history/stats
 * Resumen de visualización del usuario: tiempo total visto, cantidad de
 * títulos completados/en progreso y desglose por tipo de contenido.
 */
exports.getWatchStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const [[totals]] = await pool.query(`
      SELECT
        COUNT(*) AS total_titles,
        COALESCE(SUM(progress_seconds), 0) AS total_seconds_watched,
        SUM(CASE WHEN progress_pct >= 95 THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN progress_pct >= 1 AND progress_pct < 95 THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN media_type = 'movie' THEN 1 ELSE 0 END) AS movies,
        SUM(CASE WHEN media_type = 'tv' THEN 1 ELSE 0 END) AS series
      FROM watch_history
      WHERE user_id = ?
    `, [userId]);

    res.json({
      totalTitles: totals.total_titles,
      totalMinutesWatched: Math.round((totals.total_seconds_watched || 0) / 60),
      completed: totals.completed,
      inProgress: totals.in_progress,
      movies: totals.movies,
      series: totals.series
    });
  } catch (error) {
    console.error('❌ Error en getWatchStats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas de visualización' });
  }
};