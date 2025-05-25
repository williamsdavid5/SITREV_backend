import express from 'express';
import db from '../db.js';

const router = express.Router();

// Criar
router.post('/', async (req, res) => {
    const { viagem_id, timestamp, tipo, descricao } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO alertas (viagem_id, timestamp, tipo, descricao)
       VALUES ($1, $2, $3, $4) RETURNING *`,
            [viagem_id, timestamp, tipo, descricao]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao criar alerta' });
    }
});

// Listar
router.get('/', async (_, res) => {
    try {
        const result = await db.query('SELECT * FROM alertas');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar alertas' });
    }
});

// Buscar por ID
router.get('/:id', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM alertas WHERE id = $1', [req.params.id]);
        res.json(result.rows[0] || {});
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar alerta' });
    }
});

// Atualizar
router.put('/:id', async (req, res) => {
    const { timestamp, tipo, descricao } = req.body;
    try {
        const result = await db.query(
            `UPDATE alertas SET timestamp=$1, tipo=$2, descricao=$3 WHERE id=$4 RETURNING *`,
            [timestamp, tipo, descricao, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao atualizar alerta' });
    }
});

// Deletar
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM alertas WHERE id = $1', [req.params.id]);
        res.json({ mensagem: 'Alerta deletado' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao deletar alerta' });
    }
});

export default router;