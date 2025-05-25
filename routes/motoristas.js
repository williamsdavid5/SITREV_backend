import express from 'express';
import db from '../db.js';

const router = express.Router();

//listar todos
router.get('/', async (requestAnimationFrame, res) => {
    try {
        const result = await db.query('SELECT * FROM motoristas');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: `Erro ao buscar motoristas: ${err}` });
    }
});

//buscar com id
router.get('/:id', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM motoristas WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Motorista não encontrado' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: `Erro ao buscar o motorista id ${req.params.id}: ${err}` });
    }
})

//criar motorista
router.post('/', async (req, res) => {
    const { nome, cartao_rfid } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO motoristas (nome, cartao_rfid) values ($1, $2) RETURNING *', [nome, cartao_rfid]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: `Erro ao adicionar motorista: ${err}` });
    }
})

//atualizar
router.put('/:id', async (req, res) => {
    const { nome, cartao_rfid } = req.body;
    try {
        const result = await db.query(
            'UPDATE motoristas SET nome = $1, cartao_rfid = $2 WHERE id = $3 RETURNING *', [nome, cartao_rfid, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: `Erro ao atualizar motorista: ${err}` });
    }
});

//deletar
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM motoristas WHERE id = $1', [req.params.id]);
        res.json({ mensagem: 'Motoristas deletado' });
    } catch (err) {
        res.status(500).json({ erro: `Erro ao deletar motorista: ${err}` });
    }
})

export default router;