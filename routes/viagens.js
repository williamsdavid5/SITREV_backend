import express from 'express';
import db from '../db.js';

import { DateTime } from 'luxon';

const router = express.Router();

router.get('/limpo', async (_, res) => {
    try {
        const result = await db.query(`
            SELECT 
                v.id,
                v.inicio AS data_viagem, -- mantém o timestamp completo
                m.nome AS nome_motorista,
                ve.identificador AS identificador_veiculo,
                ve.modelo AS modelo_veiculo,
                COUNT(a.id) AS quantidade_alertas
            FROM viagens v
            JOIN motoristas m ON v.motorista_id = m.id
            JOIN veiculos ve ON v.veiculo_id = ve.id
            LEFT JOIN alertas a ON a.viagem_id = v.id
            GROUP BY v.id, m.nome, ve.identificador, ve.modelo, v.inicio
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

// Buscar viagem por ID com detalhes, registros e alertas com ponto
router.get('/:id', async (req, res) => {
    const viagemId = req.params.id;

    try {
        const { rows: viagemRows } = await db.query(`
            SELECT v.*, m.nome AS nome_motorista, ve.identificador AS identificador_veiculo, ve.modelo AS modelo_veiculo
            FROM viagens v
            JOIN motoristas m ON v.motorista_id = m.id
            JOIN veiculos ve ON v.veiculo_id = ve.id
            WHERE v.id = $1
        `, [viagemId]);

        if (viagemRows.length === 0) {
            return res.status(404).json({ erro: 'Viagem não encontrada' });
        }

        const viagem = viagemRows[0];

        const { rows: registros } = await db.query(
            `SELECT * FROM registros WHERE viagem_id = $1 ORDER BY timestamp`,
            [viagemId]
        );

        const { rows: alertas } = await db.query(
            `SELECT * FROM alertas WHERE viagem_id = $1 ORDER BY timestamp`,
            [viagemId]
        );

        const alertasComRegistros = await Promise.all(
            alertas.map(async (alerta) => {
                const { rows: registrosDoAlerta } = await db.query(`
                    SELECT r.*
                    FROM registros_alertas ra
                    JOIN registros r ON ra.registro_id = r.id
                    WHERE ra.alerta_id = $1
                    ORDER BY r.timestamp
                `, [alerta.id]);

                return {
                    ...alerta,
                    registros: registrosDoAlerta
                };
            })
        );

        res.json({
            ...viagem,
            registros,
            alertas: alertasComRegistros
        });

    } catch (err) {
        console.error('Erro ao buscar viagem detalhada:', err);
        res.status(500).json({ erro: 'Erro ao buscar dados da viagem' });
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


// Deletar viagem e todos os registros relacionados
router.delete('/:id', async (req, res) => {
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        await client.query(`
            DELETE FROM registros_alertas 
            WHERE alerta_id IN (
                SELECT id FROM alertas WHERE viagem_id = $1
            )
        `, [req.params.id]);

        await client.query('DELETE FROM alertas WHERE viagem_id = $1', [req.params.id]);

        await client.query('DELETE FROM registros WHERE viagem_id = $1', [req.params.id]);

        await client.query('DELETE FROM viagens WHERE id = $1', [req.params.id]);

        await client.query('COMMIT');
        res.json({ mensagem: 'Viagem e todos os registros relacionados deletados com sucesso' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erro ao deletar viagem:', err);
        res.status(500).json({
            erro: 'Erro ao deletar viagem',
            detalhes: err.message
        });
    } finally {
        client.release();
    }
});

// ------------------ lógica para registros de viajens --------------------------
// essa rota é para sincronizar os registros recebvidos

function converterParaBrasilia(dataUtc) {
    return DateTime.fromISO(dataUtc, { zone: 'utc' })
        .setZone('America/Sao_Paulo')
        .toISO({ suppressMilliseconds: true });
}

router.post('/registrar-viagem', async (req, res) => {
    const dados = req.body;

    if (!dados || !Array.isArray(dados.registros) || dados.registros.length === 0) {
        return res.status(400).json({ erro: 'JSON inválido ou sem registros' });
    }

    try {
        // Converter timestamps para fuso do Brasil
        const inicio = converterParaBrasilia(dados.registros[0].timestamp);
        const fim = converterParaBrasilia(dados.registros[dados.registros.length - 1].timestamp);

        // Origem
        const origem_lat = dados.registros[0].lat;
        const origem_lng = dados.registros[0].lng;

        // Destino
        const destino_lat = dados.registros[dados.registros.length - 1].lat;
        const destino_lng = dados.registros[dados.registros.length - 1].lng;

        // Verificar chuva
        const chuva_detectada = dados.registros.some(r => r.chuva === true);

        // Inserir viagem
        const viagemResult = await db.query(
            `INSERT INTO viagens (motorista_id, veiculo_id, inicio, fim, origem_lat, origem_lng, destino_lat, destino_lng, chuva_detectada, id_referencia)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING id`,
            [
                dados.motorista_id,
                dados.veiculo_id,
                inicio,
                fim,
                origem_lat,
                origem_lng,
                destino_lat,
                destino_lng,
                chuva_detectada,
                dados.viagem_id || null
            ]
        );

        const viagemId = viagemResult.rows[0].id;

        // Inserir registros
        const insertRegistros = dados.registros.map(r => ({
            ...r,
            timestamp: converterParaBrasilia(r.timestamp)
        }));

        for (const r of insertRegistros) {
            await db.query(
                `INSERT INTO registros (viagem_id, veiculo_id, timestamp, latitude, longitude, velocidade, chuva)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [
                    viagemId,
                    dados.veiculo_id,
                    r.timestamp,
                    r.lat,
                    r.lng,
                    r.vel,
                    r.chuva
                ]
            );
        }

        res.json({ sucesso: true, viagem_id: viagemId });
    } catch (err) {
        console.error('Erro ao registrar viagem:', err);
        res.status(500).json({ erro: 'Erro ao registrar viagem' });
    }
});





export default router;