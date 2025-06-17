import express from 'express';
import db from '../db.js';

const router = express.Router();

// Listar alertas com dados resumidos
router.get('/limpo', async (_, res) => {
    try {
        const { rows } = await db.query(`
            SELECT 
                a.timestamp AS data_hora,
                m.nome AS nome_motorista,
                ve.identificador AS veiculo_identificador,
                ve.modelo AS veiculo_modelo
            FROM alertas a
            JOIN viagens v ON a.viagem_id = v.id
            JOIN motoristas m ON v.motorista_id = m.id
            JOIN veiculos ve ON v.veiculo_id = ve.id
            ORDER BY a.timestamp DESC
        `);

        res.json(rows);
    } catch (err) {
        console.error('Erro ao buscar alertas resumidos:', err);
        res.status(500).json({ erro: 'Erro ao buscar alertas' });
    }
});


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
        // Buscar todos os alertas com os dados da viagem, motorista e veículo
        const { rows: alertas } = await db.query(`
            SELECT 
                a.*, 
                m.id AS motorista_id,
                m.nome AS motorista_nome,
                m.cartao_rfid AS motorista_cartao_rfid,
                ve.id AS veiculo_id,
                ve.identificador AS veiculo_identificador,
                ve.modelo AS veiculo_modelo,
                ve.status AS veiculo_status
            FROM alertas a
            JOIN viagens v ON a.viagem_id = v.id
            JOIN motoristas m ON v.motorista_id = m.id
            JOIN veiculos ve ON v.veiculo_id = ve.id
            ORDER BY a.timestamp DESC
        `);

        // Para cada alerta, buscar os registros relacionados (pontos no mapa)
        const alertasComPontos = await Promise.all(
            alertas.map(async (alerta) => {
                const { rows: registros } = await db.query(`
                    SELECT r.*
                    FROM registros_alertas ra
                    JOIN registros r ON ra.registro_id = r.id
                    WHERE ra.alerta_id = $1
                    ORDER BY r.timestamp
                `, [alerta.id]);

                return {
                    id: alerta.id,
                    tipo: alerta.tipo,
                    descricao: alerta.descricao,
                    timestamp: alerta.timestamp,
                    viagem_id: alerta.viagem_id,
                    veiculo: {
                        id: alerta.veiculo_id,
                        identificador: alerta.veiculo_identificador,
                        modelo: alerta.veiculo_modelo,
                        status: alerta.veiculo_status
                    },
                    motorista: {
                        id: alerta.motorista_id,
                        nome: alerta.motorista_nome,
                        cartao_rfid: alerta.motorista_cartao_rfid
                    },
                    registros: registros
                };
            })
        );

        res.json(alertasComPontos);
    } catch (err) {
        console.error('Erro ao buscar alertas:', err);
        res.status(500).json({ erro: 'Erro ao buscar alertas' });
    }
});

// Buscar alerta por ID com motorista, veículo e registros (pontos) relacionados
router.get('/:id', async (req, res) => {
    const alertaId = req.params.id;

    try {
        // Buscar os dados principais do alerta junto com viagem, motorista e veículo
        const { rows } = await db.query(`
            SELECT 
                a.*, 
                m.id AS motorista_id,
                m.nome AS motorista_nome,
                m.cartao_rfid AS motorista_cartao_rfid,
                ve.id AS veiculo_id,
                ve.identificador AS veiculo_identificador,
                ve.modelo AS veiculo_modelo,
                ve.status AS veiculo_status
            FROM alertas a
            JOIN viagens v ON a.viagem_id = v.id
            JOIN motoristas m ON v.motorista_id = m.id
            JOIN veiculos ve ON v.veiculo_id = ve.id
            WHERE a.id = $1
        `, [alertaId]);

        if (rows.length === 0) {
            return res.status(404).json({ erro: 'Alerta não encontrado' });
        }

        const alerta = rows[0];

        // Buscar registros (pontos) relacionados a esse alerta
        const { rows: registros } = await db.query(`
            SELECT r.*
            FROM registros_alertas ra
            JOIN registros r ON ra.registro_id = r.id
            WHERE ra.alerta_id = $1
            ORDER BY r.timestamp
        `, [alertaId]);

        res.json({
            id: alerta.id,
            tipo: alerta.tipo,
            descricao: alerta.descricao,
            timestamp: alerta.timestamp,
            viagem_id: alerta.viagem_id,
            veiculo: {
                id: alerta.veiculo_id,
                identificador: alerta.veiculo_identificador,
                modelo: alerta.veiculo_modelo,
                status: alerta.veiculo_status
            },
            motorista: {
                id: alerta.motorista_id,
                nome: alerta.motorista_nome,
                cartao_rfid: alerta.motorista_cartao_rfid
            },
            registros: registros
        });
    } catch (err) {
        console.error('Erro ao buscar alerta:', err);
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