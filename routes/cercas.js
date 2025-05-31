import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET cercas agrupadas por camada
router.get('/camadas/agrupadas', async (req, res) => {
    const cercas = await db.query(`
        SELECT c.*, ca.nome AS nome_camada
        FROM cercas c
        JOIN camadas ca ON c.camada_id = ca.id
    `);
    const pontos = await db.query('SELECT * FROM pontos_cerca');

    const cercasComPontos = cercas.rows.map(cerca => ({
        id: cerca.id,
        nome: cerca.nome,
        tipo: cerca.tipo,
        cor: cerca.cor,
        velocidade_max: cerca.velocidade_max,
        velocidade_chuva: cerca.velocidade_chuva,
        coordenadas: pontos.rows
            .filter(p => p.cerca_id === cerca.id)
            .sort((a, b) => a.ordem - b.ordem)
            .map(p => [p.latitude, p.longitude])
    }));

    // Agrupar por camada
    const agrupadas = {};
    cercas.rows.forEach(cerca => {
        const camadaNome = cerca.nome_camada;
        if (!agrupadas[camadaNome]) {
            agrupadas[camadaNome] = [];
        }
        const cercaInfo = cercasComPontos.find(c => c.id === cerca.id);
        agrupadas[camadaNome].push(cercaInfo);
    });

    res.json(agrupadas);
});

// GET todas as camadas com suas cercas
router.get('/camadas', async (req, res) => {
    const camadas = await db.query('SELECT * FROM camadas');
    const cercas = await db.query('SELECT * FROM cercas');
    const pontos = await db.query('SELECT * FROM pontos_cerca');

    const resultado = camadas.rows.map(camada => {
        const cercasDaCamada = cercas.rows
            .filter(c => c.camada_id === camada.id)
            .map(cerca => ({
                id: cerca.id,
                nome: cerca.nome,
                tipo: cerca.tipo,
                cor: cerca.cor,
                velocidade_max: cerca.velocidade_max,
                velocidade_chuva: cerca.velocidade_chuva,
                coordenadas: pontos.rows
                    .filter(p => p.cerca_id === cerca.id)
                    .sort((a, b) => a.ordem - b.ordem)
                    .map(p => [p.latitude, p.longitude])
            }));

        return {
            id: camada.id,
            nome: camada.nome,
            cercas: cercasDaCamada
        };
    });

    res.json(resultado);
});

// GET todas as cercas com seus pontos (formato simplificado)
router.get('/', async (req, res) => {
    const cercas = await db.query(`
        SELECT c.*, ca.nome AS nome_camada
        FROM cercas c
        JOIN camadas ca ON c.camada_id = ca.id
    `);

    const pontos = await db.query('SELECT * FROM pontos_cerca');

    const cercasComCoordenadas = cercas.rows.map(cerca => ({
        id: cerca.id,
        nome: cerca.nome,
        tipo: cerca.tipo,
        cor: cerca.cor,
        camada: {
            id: cerca.camada_id,
            nome: cerca.nome_camada
        },
        velocidade_max: cerca.velocidade_max,
        velocidade_chuva: cerca.velocidade_chuva,
        coordenadas: pontos.rows
            .filter(p => p.cerca_id === cerca.id)
            .sort((a, b) => a.ordem - b.ordem)
            .map(p => [p.latitude, p.longitude])
    }));

    res.json(cercasComCoordenadas);
});

// GET cerca por ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    const cerca = await db.query(`
        SELECT c.*, ca.nome AS nome_camada
        FROM cercas c
        JOIN camadas ca ON c.camada_id = ca.id
        WHERE c.id = $1
    `, [id]);

    if (cerca.rows.length === 0) return res.sendStatus(404);

    const pontos = await db.query(
        'SELECT * FROM pontos_cerca WHERE cerca_id = $1 ORDER BY ordem', [id]
    );

    const dados = {
        id: cerca.rows[0].id,
        nome: cerca.rows[0].nome,
        tipo: cerca.rows[0].tipo,
        cor: cerca.rows[0].cor,
        camada: {
            id: cerca.rows[0].camada_id,
            nome: cerca.rows[0].nome_camada
        },
        velocidade_max: cerca.rows[0].velocidade_max,
        velocidade_chuva: cerca.rows[0].velocidade_chuva,
        coordenadas: pontos.rows.map(p => [p.latitude, p.longitude])
    };

    res.json(dados);
});

// POST nova cerca
router.post('/', async (req, res) => {
    const { nome, tipo, cor, camada_id, velocidade_max, velocidade_chuva, coordenadas } = req.body;

    // Verificação de campos obrigatórios
    if (!nome || !tipo || !cor || camada_id == null || velocidade_max == null || velocidade_chuva == null || !Array.isArray(coordenadas) || coordenadas.length < 3) {
        return res.status(400).json({
            erro: 'Campos obrigatórios ausentes ou inválidos',
            recebido: {
                nome, tipo, cor, camada_id, velocidade_max, velocidade_chuva, coordenadas
            }
        });
    }

    try {
        // Corrigir a sequência de IDs
        await db.query('SELECT setval(pg_get_serial_sequence(\'cercas\', \'id\'), coalesce(max(id), 0) + 1 FROM cercas', []);

        // Cria a cerca
        const nova = await db.query(`
            INSERT INTO cercas (nome, tipo, cor, camada_id, velocidade_max, velocidade_chuva)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [nome, tipo, cor, camada_id, velocidade_max, velocidade_chuva]);

        const cercaCriada = nova.rows[0];

        // Insere os pontos
        for (let i = 0; i < coordenadas.length; i++) {
            const [latitude, longitude] = coordenadas[i];
            await db.query(`
                INSERT INTO pontos_cerca (cerca_id, latitude, longitude, ordem)
                VALUES ($1, $2, $3, $4)
            `, [cercaCriada.id, latitude, longitude, i]);
        }

        res.status(201).json(cercaCriada);
    } catch (err) {
        console.error('Erro ao criar cerca:', err);
        res.status(500).json({ erro: 'Erro interno ao criar cerca' });
    }
});


// PUT atualizar cerca
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, tipo, cor, camada_id, velocidade_max, velocidade_chuva } = req.body;

    const atualizada = await db.query(`
        UPDATE cercas
        SET nome = $1, tipo = $2, cor = $3, camada_id = $4, velocidade_max = $5, velocidade_chuva = $6
        WHERE id = $7
        RETURNING *
    `, [nome, tipo, cor, camada_id, velocidade_max, velocidade_chuva, id]);

    if (atualizada.rows.length === 0) return res.sendStatus(404);

    res.json(atualizada.rows[0]);
});

// deletar cerca e seus pontos
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await db.query('BEGIN');

        await db.query('DELETE FROM pontos_cerca WHERE cerca_id = $1', [id]);

        await db.query('DELETE FROM cercas WHERE id = $1', [id]);

        await db.query('COMMIT');

        res.sendStatus(204);
    } catch (err) {
        await db.query('ROLLBACK');
        console.error('Erro ao deletar cerca:', err);
        res.sendStatus(500);
    }
});


export default router;