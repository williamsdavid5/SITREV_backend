import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET todas as cercas com seus pontos
router.get('/', async (req, res) => {
    const cercas = await db.query('SELECT * FROM cercas');
    const pontos = await db.query('SELECT * FROM pontos_cerca');

    const cercasComPontos = cercas.rows.map(cerca => ({
        ...cerca,
        pontos: pontos.rows.filter(p => p.cerca_id === cerca.id)
    }));

    res.json(cercasComPontos);
});

// GET uma cerca por ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const cerca = await db.query('SELECT * FROM cercas WHERE id = $1', [id]);
    const pontos = await db.query('SELECT * FROM pontos_cerca WHERE cerca_id = $1 ORDER BY ordem', [id]);

    if (cerca.rows.length === 0) return res.sendStatus(404);

    res.json({ ...cerca.rows[0], pontos: pontos.rows });
});

// POST criar nova cerca
router.post('/', async (req, res) => {
    const { nome, cor, camada, velocidade_max, velocidade_chuva } = req.body;
    const nova = await db.query(
        `INSERT INTO cercas (nome, cor, camada, velocidade_max, velocidade_chuva)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [nome, cor, camada, velocidade_max, velocidade_chuva]
    );
    res.status(201).json(nova.rows[0]);
});

// PUT atualizar cerca
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, cor, camada, velocidade_max, velocidade_chuva } = req.body;

    const atualizada = await db.query(
        `UPDATE cercas SET nome = $1, cor = $2, camada = $3, velocidade_max = $4, velocidade_chuva = $5
     WHERE id = $6 RETURNING *`,
        [nome, cor, camada, velocidade_max, velocidade_chuva, id]
    );

    if (atualizada.rows.length === 0) return res.sendStatus(404);
    res.json(atualizada.rows[0]);
});

// DELETE cerca
router.delete('/:id', async (req, res) => {
    await db.query('DELETE FROM cercas WHERE id = $1', [req.params.id]);
    res.sendStatus(204);
});

// GET cercas agrupadas por camada
router.get('/camadas/agrupadas', async (req, res) => {
    const cercas = await db.query('SELECT * FROM cercas');
    const pontos = await db.query('SELECT * FROM pontos_cerca');

    const cercasComPontos = cercas.rows.map(cerca => ({
        ...cerca,
        pontos: pontos.rows.filter(p => p.cerca_id === cerca.id)
    }));

    const agrupadas = cercasComPontos.reduce((acc, cerca) => {
        if (!acc[cerca.camada]) acc[cerca.camada] = [];
        acc[cerca.camada].push(cerca);
        return acc;
    }, {});

    res.json(agrupadas);
});

export default router;