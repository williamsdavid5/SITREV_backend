import express from 'express';
import db from '../db.js';

const router = express.Router();

//rotas leves para evitar receber todos os dados de uma vez
//enviam informações dos motoristas, mas também alguns dados uteis sobre ultimas viagens
router.get('/limpo', async (_, res) => {
    try {
        const { rows: motoristas } = await db.query('SELECT * FROM motoristas');

        const motoristasComUltimaLeitura = await Promise.all(
            motoristas.map(async (motorista) => {
                // Última viagem (ordem decrescente por início)
                const { rows: [ultimaViagem] } = await db.query(
                    `SELECT * FROM viagens 
                     WHERE motorista_id = $1 
                     ORDER BY inicio DESC 
                     LIMIT 1`,
                    [motorista.id]
                );

                let ultimaLeitura = null;
                let status = 'parado';

                if (ultimaViagem) {
                    const { rows: [registro] } = await db.query(
                        `SELECT * FROM registros 
                         WHERE viagem_id = $1 
                         ORDER BY timestamp DESC 
                         LIMIT 1`,
                        [ultimaViagem.id]
                    );

                    if (registro) {
                        ultimaLeitura = {
                            horario: registro.timestamp,
                            latitude: registro.latitude,
                            longitude: registro.longitude,
                            velocidade: registro.velocidade,
                        };
                    }

                    if (!ultimaViagem.fim) {
                        status = 'em_movimento';
                    }
                }

                return {
                    ...motorista,
                    status,
                    ultimaLeitura,
                };
            })
        );

        res.json(motoristasComUltimaLeitura);
    } catch (err) {
        res.status(500).json({ erro: `Erro ao buscar motoristas: ${err}` });
    }
});

router.get('/limpo/:id', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM motoristas WHERE id = $1', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ erro: 'Motorista não encontrado' });

        const motorista = rows[0];

        const { rows: [ultimaViagem] } = await db.query(
            `SELECT * FROM viagens 
             WHERE motorista_id = $1 
             ORDER BY inicio DESC 
             LIMIT 1`,
            [motorista.id]
        );

        let ultimaLeitura = null;
        let status = 'parado';

        if (ultimaViagem) {
            const { rows: [registro] } = await db.query(
                `SELECT * FROM registros 
                 WHERE viagem_id = $1 
                 ORDER BY timestamp DESC 
                 LIMIT 1`,
                [ultimaViagem.id]
            );

            if (registro) {
                ultimaLeitura = {
                    horario: registro.timestamp,
                    latitude: registro.latitude,
                    longitude: registro.longitude,
                    velocidade: registro.velocidade,
                };
            }

            if (!ultimaViagem.fim) {
                status = 'em_movimento';
            }
        }

        res.json({
            ...motorista,
            status,
            ultimaLeitura,
        });
    } catch (err) {
        res.status(500).json({ erro: `Erro ao buscar o motorista id ${req.params.id}: ${err}` });
    }
});


// Listar todos os motoristas com viagens e alertas
router.get('/', async (_, res) => {
    try {
        const { rows: motoristas } = await db.query('SELECT * FROM motoristas');

        const motoristasComDetalhes = await Promise.all(
            motoristas.map(async (motorista) => {
                // Buscar viagens do motorista
                const { rows: viagens } = await db.query(
                    'SELECT * FROM viagens WHERE motorista_id = $1',
                    [motorista.id]
                );

                // Buscar alertas do motorista
                const { rows: alertasBase } = await db.query(
                    `SELECT a.* FROM alertas a
     JOIN viagens v ON a.viagem_id = v.id
     WHERE v.motorista_id = $1`,
                    [motorista.id]
                );

                const alertas = await Promise.all(alertasBase.map(async (alerta) => {
                    const { rows: registros } = await db.query(
                        `SELECT r.latitude, r.longitude, r.timestamp, r.velocidade
         FROM registros_alertas ra
         JOIN registros r ON ra.registro_id = r.id
         WHERE ra.alerta_id = $1
         ORDER BY r.timestamp ASC`,
                        [alerta.id]
                    );

                    return {
                        ...alerta,
                        registroCoordenadas: registros
                    };
                }));


                // Para cada viagem, buscar registros
                const viagensComRegistros = await Promise.all(
                    viagens.map(async (viagem) => {
                        const { rows: registros } = await db.query(
                            'SELECT * FROM registros WHERE viagem_id = $1 ORDER BY timestamp ASC',
                            [viagem.id]
                        );
                        return {
                            ...viagem,
                            registros
                        };
                    })
                );

                return {
                    ...motorista,
                    viagens: viagensComRegistros,
                    alertas
                };
            })
        );

        res.json(motoristasComDetalhes);
    } catch (err) {
        res.status(500).json({ erro: `Erro ao buscar motoristas: ${err}` });
    }
});


// Buscar um motorista por ID com viagens e alertas
router.get('/:id', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM motoristas WHERE id = $1', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ erro: 'Motorista não encontrado' });

        const motorista = rows[0];

        const { rows: viagens } = await db.query(
            'SELECT * FROM viagens WHERE motorista_id = $1',
            [motorista.id]
        );

        const { rows: alertasBase } = await db.query(
            `SELECT a.* FROM alertas a
     JOIN viagens v ON a.viagem_id = v.id
     WHERE v.motorista_id = $1`,
            [motorista.id]
        );

        const alertas = await Promise.all(alertasBase.map(async (alerta) => {
            const { rows: registros } = await db.query(
                `SELECT r.latitude, r.longitude, r.timestamp, r.velocidade
         FROM registros_alertas ra
         JOIN registros r ON ra.registro_id = r.id
         WHERE ra.alerta_id = $1
         ORDER BY r.timestamp ASC`,
                [alerta.id]
            );

            // Buscar informações do veículo para o alerta
            const { rows: veiculoRows } = await db.query(
                'SELECT identificador, modelo FROM veiculos WHERE id = $1',
                [alerta.veiculo_id]
            );

            return {
                ...alerta,
                ...(veiculoRows[0] && {
                    veiculo_identificador: veiculoRows[0].identificador,
                    veiculo_modelo: veiculoRows[0].modelo
                }),
                registroCoordenadas: registros
            };
        }));

        // Buscar registros e informações do veículo para cada viagem
        const viagensComRegistros = await Promise.all(
            viagens.map(async (viagem) => {
                const { rows: registros } = await db.query(
                    'SELECT * FROM registros WHERE viagem_id = $1 ORDER BY timestamp ASC',
                    [viagem.id]
                );

                // Buscar informações do veículo para a viagem
                const { rows: veiculoRows } = await db.query(
                    'SELECT identificador, modelo FROM veiculos WHERE id = $1',
                    [viagem.veiculo_id]
                );

                return {
                    ...viagem,
                    ...(veiculoRows[0] && {
                        veiculo_identificador: veiculoRows[0].identificador,
                        veiculo_modelo: veiculoRows[0].modelo
                    }),
                    registros
                };
            })
        );

        res.json({
            ...motorista,
            viagens: viagensComRegistros,
            alertas
        });
    } catch (err) {
        res.status(500).json({ erro: `Erro ao buscar o motorista id ${req.params.id}: ${err}` });
    }
});


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