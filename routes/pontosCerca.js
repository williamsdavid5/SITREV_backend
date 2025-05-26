import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET todos os pontos
router.get('/', async (req, res) => {
    const pontos = await db.query('SELECT * FROM pontos_cerca ORDER BY cerca_id, ordem');
    res.json(pontos.rows);
});

// POST ponto individual
router.post('/', async (req, res) => {
    const { cerca_id, latitude, longitude, ordem } = req.body;
    const novo = await db.query(
        `INSERT INTO pontos_cerca (cerca_id, latitude, longitude, ordem)
     VALUES ($1, $2, $3, $4) RETURNING *`,
        [cerca_id, latitude, longitude, ordem]
    );
    res.status(201).json(novo.rows[0]);
});

// PUT ponto
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { latitude, longitude, ordem } = req.body;

    const atualizado = await db.query(
        `UPDATE pontos_cerca SET latitude = $1, longitude = $2, ordem = $3
     WHERE id = $4 RETURNING *`,
        [latitude, longitude, ordem, id]
    );

    if (atualizado.rows.length === 0) return res.sendStatus(404);
    res.json(atualizado.rows[0]);
});

// DELETE ponto
router.delete('/:id', async (req, res) => {
    await db.query('DELETE FROM pontos_cerca WHERE id = $1', [req.params.id]);
    res.sendStatus(204);
});

export default router;