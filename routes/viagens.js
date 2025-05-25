import express from 'express';
import db from '../db.js';

const router = express.Router();

// Criar viagem
router.post('/', async (req, res) => {
    const { motorista_id, inicio, origem_lat, origem_lng } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO viagens (motorista_id, inicio, origem_lat, origem_lng, origem_registrada)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING *`,
            [motorista_id, inicio, origem_lat, origem_lng]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao iniciar viagem' });
    }
});

// Listar todas
router.get('/', async (_, res) => {
    try {
        const result = await db.query('SELECT * FROM viagens');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar viagens' });
    }
});

// Buscar por ID
router.get('/:id', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM viagens WHERE id = $1', [req.params.id]);
        res.json(result.rows[0] || {});
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar viagem' });
    }
});

// Atualizar
router.put('/:id', async (req, res) => {
    const { fim, destino_lat, destino_lng, chuva_detectada } = req.body;
    try {
        const result = await db.query(
            `UPDATE viagens SET fim = $1, destino_lat = $2, destino_lng = $3, chuva_detectada = $4 WHERE id = $5 RETURNING *`,
            [fim, destino_lat, destino_lng, chuva_detectada, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao atualizar viagem' });
    }
});

// Deletar
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM viagens WHERE id = $1', [req.params.id]);
        res.json({ mensagem: 'Viagem deletada' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao deletar viagem' });
    }
});

export default router;