import express from 'express';
import db from '../db.js';

const router = express.Router();

// Criar ponto
router.post('/', async (req, res) => {
    const { cerca_id, latitude, longitude, ordem } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO pontos_cerca (cerca_id, latitude, longitude, ordem)
       VALUES ($1, $2, $3, $4) RETURNING *`,
            [cerca_id, latitude, longitude, ordem]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao criar ponto da cerca' });
    }
});

// Listar todos
router.get('/', async (_, res) => {
    try {
        const result = await db.query('SELECT * FROM pontos_cerca');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao listar pontos' });
    }
});

// Buscar pontos de uma cerca
router.get('/cerca/:cercaId', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM pontos_cerca WHERE cerca_id = $1 ORDER BY ordem`,
            [req.params.cercaId]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar pontos da cerca' });
    }
});

// Buscar ponto por ID
router.get('/:id', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM pontos_cerca WHERE id = $1', [req.params.id]);
        res.json(result.rows[0] || {});
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar ponto' });
    }
});

// Atualizar ponto
router.put('/:id', async (req, res) => {
    const { latitude, longitude, ordem } = req.body;
    try {
        const result = await db.query(
            `UPDATE pontos_cerca SET latitude=$1, longitude=$2, ordem=$3 WHERE id=$4 RETURNING *`,
            [latitude, longitude, ordem, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao atualizar ponto' });
    }
});

// Deletar ponto
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM pontos_cerca WHERE id = $1', [req.params.id]);
        res.json({ mensagem: 'Ponto deletado' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao deletar ponto' });
    }
});

export default router;