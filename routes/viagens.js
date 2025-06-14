import express from 'express';
import db from '../db.js';

const router = express.Router();

// Listar viagens com dados resumidos
router.get('/limpo', async (_, res) => {
    try {
        const result = await db.query(`
            SELECT 
                v.id,
                v.inicio::date AS data_viagem,
                m.nome AS nome_motorista,
                ve.identificador AS identificador_veiculo
            FROM viagens v
            JOIN motoristas m ON v.motorista_id = m.id
            JOIN veiculos ve ON v.veiculo_id = ve.id
            ORDER BY v.inicio DESC
        `);

        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar viagens resumidas:', err);
        res.status(500).json({ erro: 'Erro ao buscar viagens' });
    }
});

// Criar viagem
router.post('/', async (req, res) => {
    const { motorista_id, veiculo_id, inicio, origem_lat, origem_lng } = req.body;

    if (!motorista_id || !veiculo_id || !inicio || origem_lat == null || origem_lng == null) {
        return res.status(400).json({ erro: 'Campos obrigatórios ausentes' });
    }

    try {
        const result = await db.query(
            `INSERT INTO viagens (motorista_id, veiculo_id, inicio, origem_lat, origem_lng, origem_registrada)
             VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING *`,
            [motorista_id, veiculo_id, inicio, origem_lat, origem_lng]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao iniciar viagem' });
    }
});

// Listar todas as viagens com info do motorista e veículo
router.get('/', async (_, res) => {
    try {
        const result = await db.query(`
            SELECT v.*, 
                   m.nome AS nome_motorista, 
                   ve.identificador AS identificador_veiculo, 
                   ve.modelo AS modelo_veiculo
            FROM viagens v
            JOIN motoristas m ON v.motorista_id = m.id
            JOIN veiculos ve ON v.veiculo_id = ve.id
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao buscar viagens' });
    }
});

router.get('/registros', async (req, res) => {
    try {
        const { rows: viagens } = await db.query(`
            SELECT v.*, 
                   m.nome AS nome_motorista, 
                   ve.identificador AS veiculo_identificador,
                   ve.modelo AS veiculo_modelo
            FROM viagens v
            JOIN motoristas m ON v.motorista_id = m.id
            JOIN veiculos ve ON v.veiculo_id = ve.id
        `);

        const viagensComRegistros = await Promise.all(
            viagens.map(async (viagem) => {
                const { rows: registros } = await db.query(
                    'SELECT * FROM registros WHERE viagem_id = $1',
                    [viagem.id]
                );

                return {
                    ...viagem,
                    registros,
                };
            })
        );

        res.json(viagensComRegistros);
    } catch (err) {
        console.error('Erro ao buscar registros:', err);
        res.status(500).json({ erro: 'Erro ao buscar registros no banco de dados' });
    }
});

// Buscar viagem por ID com detalhes
router.get('/:id', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT v.*, m.nome AS nome_motorista, ve.identificador AS identificador_veiculo, ve.modelo AS modelo_veiculo
            FROM viagens v
            JOIN motoristas m ON v.motorista_id = m.id
            JOIN veiculos ve ON v.veiculo_id = ve.id
            WHERE v.id = $1
        `, [req.params.id]);
        res.json(result.rows[0] || {});
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao buscar viagem' });
    }
});

// Atualizar viagem
router.put('/:id', async (req, res) => {
    const { fim, destino_lat, destino_lng, chuva_detectada } = req.body;
    try {
        const result = await db.query(
            `UPDATE viagens SET fim = $1, destino_lat = $2, destino_lng = $3, chuva_detectada = $4 WHERE id = $5 RETURNING *`,
            [fim, destino_lat, destino_lng, chuva_detectada, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao atualizar viagem' });
    }
});

// Deletar viagem
router.delete('/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM viagens WHERE id = $1', [req.params.id]);
        res.json({ mensagem: 'Viagem deletada' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao deletar viagem' });
    }
});

export default router;