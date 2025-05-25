import express from 'express';
import db from '../db.js';

const router = express.Router();

// Criar
router.post('/', async (req, res) => {
    const { viagem_id, timestamp, latitude, longitude, velocidade, chuva } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO registros (viagem_id, timestamp, latitude, longitude, velocidade, chuva)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [viagem_id, timestamp, latitude, longitude, velocidade, chuva]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao criar registro' });
    }
});

// Listar
router.get('/', async (_, res) => {
    try {
        const result = await db.query('SELECT * FROM registros');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar registros' });
    }
});

// Buscar por ID
router.get('/:id', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM registros WHERE id = $1', [req.params.id]);
        res.json(result.rows[0] || {});
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar registro' });
    }
});

// Atualizar
router.put('/:id', async (req, res) => {
    const { timestamp, latitude, longitude, velocidade, chuva } = req.body;
    try {
        const result = await db.query(
            `UPDATE registros SET timestamp=$1, latitude=$2, longitude=$3, velocidade=$4, chuva=$5 WHERE id = $6 RETURNING *`,
            [timestamp, latitude, longitude, velocidade, chuva, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao atualizar registro' });
    }
});

// Deletar
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM registros WHERE id = $1', [req.params.id]);
        res.json({ mensagem: 'Registro deletado' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao deletar registro' });
    }
});

export default router;