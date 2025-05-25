import express from 'express';
import db from '../db.js';

const router = express.Router();

router.get('/', async (requestAnimationFrame, res) => {
    try {
        const result = await db.query('SELECT * FROM motoristas');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar motoristas' });
    }
});

export default router;