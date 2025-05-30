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

router.put('/atualizar/:cerca_id', async (req, res) => {
    const { cerca_id } = req.params;
    const { coordenadas } = req.body;

    try {
        await db.query('BEGIN');

        await db.query('DELETE FROM pontos_cerca WHERE cerca_id = $1', [cerca_id]);

        for (let i = 0; i < coordenadas.length; i++) {
            const [lat, lng] = coordenadas[i];
            await db.query(
                'INSERT INTO pontos_cerca (cerca_id, latitude, longitude, ordem) VALUES ($1, $2, $3, $4)',
                [cerca_id, lat, lng, i]
            );
        }

        await db.query('COMMIT');
        res.sendStatus(200);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Erro ao atualizar pontos da cerca' });
    }
});

// DELETE ponto
router.delete('/:id', async (req, res) => {
    await db.query('DELETE FROM pontos_cerca WHERE id = $1', [req.params.id]);
    res.sendStatus(204);
});

export default router;