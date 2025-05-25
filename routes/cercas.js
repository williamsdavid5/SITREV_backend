import express from 'express';
import db from '../db.js';

const router = express.Router();

// Criar cerca
router.post('/', async (req, res) => {
    const { nome, velocidade_max, velocidade_chuva } = req.body;
    try {
        const result = await db.query(
            `INSERT INTO cercas (nome, velocidade_max, velocidade_chuva)
       VALUES ($1, $2, $3) RETURNING *`,
            [nome, velocidade_max, velocidade_chuva]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao criar cerca' });
    }
});

// Listar todas
router.get('/', async (_, res) => {
    try {
        const result = await db.query('SELECT * FROM cercas');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao listar cercas' });
    }
});

// Buscar por ID
router.get('/:id', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM cercas WHERE id = $1', [req.params.id]);
        res.json(result.rows[0] || {});
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar cerca' });
    }
});

// Atualizar
router.put('/:id', async (req, res) => {
    const { nome, velocidade_max, velocidade_chuva } = req.body;
    try {
        const result = await db.query(
            `UPDATE cercas SET nome=$1, velocidade_max=$2, velocidade_chuva=$3 WHERE id=$4 RETURNING *`,
            [nome, velocidade_max, velocidade_chuva, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao atualizar cerca' });
    }
});

// Deletar
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM cercas WHERE id = $1', [req.params.id]);
        res.json({ mensagem: 'Cerca deletada' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao deletar cerca' });
    }
});

export default router;