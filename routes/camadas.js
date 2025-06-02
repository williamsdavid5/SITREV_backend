import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET todas as camadas
router.get('/', async (req, res) => {
    const resultado = await db.query('SELECT * FROM camadas ORDER BY id');
    res.json(resultado.rows);
});

// GET camada por ID (com cercas associadas)
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    const camada = await db.query('SELECT * FROM camadas WHERE id = $1', [id]);
    if (camada.rows.length === 0) return res.sendStatus(404);

    const cercas = await db.query('SELECT * FROM cercas WHERE camada_id = $1', [id]);

    res.json({
        ...camada.rows[0],
        cercas: cercas.rows
    });
});

// POST nova camada
router.post('/', async (req, res) => {
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });

    try {
        // Garante que a sequência está correta
        await db.query(`
            SELECT setval('camadas_id_seq', (SELECT COALESCE(MAX(id), 0) FROM camadas));
        `);

        const nova = await db.query(
            'INSERT INTO camadas (nome) VALUES ($1) RETURNING *',
            [nome]
        );

        res.status(201).json(nova.rows[0]);
    } catch (error) {
        console.error('Erro ao criar camada:', error);
        res.status(500).json({ erro: 'Erro ao criar camada' });
    }
});

// PUT atualizar camada
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { nome } = req.body;

    const atualizada = await db.query(
        'UPDATE camadas SET nome = $1 WHERE id = $2 RETURNING *',
        [nome, id]
    );

    if (atualizada.rows.length === 0) return res.sendStatus(404);
    res.json(atualizada.rows[0]);
});

// DELETE camada (bloqueia se tiver cercas associadas)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // Verifica se há cercas associadas
        const cercas = await db.query('SELECT COUNT(*) FROM cercas WHERE camada_id = $1', [id]);
        const total = parseInt(cercas.rows[0].count);

        if (total > 0) {
            return res.status(400).json({
                erro: 'Camada possui cercas associadas e não pode ser excluída',
                possuiCercas: true
            });
        }

        const resultado = await db.query('DELETE FROM camadas WHERE id = $1 RETURNING *', [id]);

        if (resultado.rows.length === 0) return res.sendStatus(404);
        res.sendStatus(204);
    } catch (error) {
        console.error('Erro ao excluir camada:', error);
        res.status(500).json({ erro: 'Erro ao excluir camada' });
    }
});

// DELETE camada com deleção manual das cercas associadas
router.delete('/force/:id', async (req, res) => {
    const { id } = req.params;

    const cercas = await db.query('SELECT id FROM cercas WHERE camada_id = $1', [id]);

    for (const cerca of cercas.rows) {
        await db.query('DELETE FROM pontos_cerca WHERE cerca_id = $1', [cerca.id]);
    }

    await db.query('DELETE FROM cercas WHERE camada_id = $1', [id]);

    const resultado = await db.query('DELETE FROM camadas WHERE id = $1 RETURNING *', [id]);

    if (resultado.rows.length === 0) return res.sendStatus(404);
    res.sendStatus(204);
});

export default router;