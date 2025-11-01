import express from 'express';
import db from '../db.js';

const router = express.Router();

router.get('/registros', async (req, res) => {
    try {
        const query = `
            SELECT 
              v.id AS veiculo_id, v.identificador, v.modelo, v.status,

              vi.id AS viagem_id, vi.inicio, vi.fim, vi.chuva_detectada, 
              vi.origem_lat, vi.origem_lng, vi.destino_lat, vi.destino_lng,

              m.id AS motorista_id, m.nome AS motorista_nome, m.cartao_rfid,

              r.id AS registro_id, r.timestamp, r.latitude, r.longitude, 
              r.velocidade, r.chuva, r.limite_aplicado

            FROM veiculos v
            JOIN viagens vi ON vi.veiculo_id = v.id
            JOIN motoristas m ON m.id = vi.motorista_id
            LEFT JOIN registros r ON r.viagem_id = vi.id

            WHERE vi.id = (
              SELECT id FROM viagens 
              WHERE veiculo_id = v.id 
              ORDER BY inicio DESC 
              LIMIT 1
            )
            ORDER BY r.timestamp ASC
        `;

        const result = await db.query(query);

        // Agrupar por veículo
        const veiculosMap = new Map();

        result.rows.forEach(row => {
            if (!veiculosMap.has(row.veiculo_id)) {
                veiculosMap.set(row.veiculo_id, {
                    id: row.veiculo_id,
                    identificador: row.identificador,
                    modelo: row.modelo,
                    status: row.status,
                    viagem: {
                        id: row.viagem_id,
                        inicio: row.inicio,
                        fim: row.fim,
                        chuva_detectada: row.chuva_detectada,
                        origem: {
                            lat: row.origem_lat,
                            lng: row.origem_lng
                        },
                        destino: {
                            lat: row.destino_lat,
                            lng: row.destino_lng
                        },
                        motorista: {
                            id: row.motorista_id,
                            nome: row.motorista_nome,
                            cartao_rfid: row.cartao_rfid
                        },
                        registros: []
                    }
                });
            }

            if (row.registro_id) {
                veiculosMap.get(row.veiculo_id).viagem.registros.push({
                    id: row.registro_id,
                    timestamp: row.timestamp,
                    latitude: row.latitude,
                    longitude: row.longitude,
                    velocidade: row.velocidade,
                    chuva: row.chuva,
                    limite_aplicado: row.limite_aplicado
                });
            }
        });

        res.json(Array.from(veiculosMap.values()));

    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao buscar os registros dos veículos' });
    }
});

router.get('/limpo', async (req, res) => {
    try {
        const query = `
            SELECT 
                v.id,
                v.identificador,
                v.modelo,
                r.timestamp as ultima_leitura
            FROM veiculos v
            LEFT JOIN viagens vi ON vi.veiculo_id = v.id
            LEFT JOIN registros r ON r.viagem_id = vi.id
            WHERE r.timestamp = (
                SELECT MAX(r2.timestamp)
                FROM registros r2
                JOIN viagens vi2 ON vi2.id = r2.viagem_id
                WHERE vi2.veiculo_id = v.id
            )
            ORDER BY v.identificador
        `;

        const result = await db.query(query);

        // Formatar a resposta
        const registrosLimpos = result.rows.map(row => ({
            id: row.id,
            identificador: row.identificador,
            modelo: row.modelo,
            ultima_leitura: row.ultima_leitura
        }));

        res.json(registrosLimpos);

    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao buscar os registros limpos dos veículos' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const veiculoId = req.params.id;

        // Query principal para buscar o veículo e suas viagens
        const query = `
            SELECT 
                v.id AS veiculo_id,
                v.identificador AS veiculo_identificador,
                v.modelo AS veiculo_modelo,
                v.status AS veiculo_status,
                
                vi.id AS viagem_id,
                vi.inicio AS viagem_inicio,
                vi.fim AS viagem_fim,
                vi.origem_lat,
                vi.origem_lng,
                vi.destino_lat,
                vi.destino_lng,
                vi.chuva_detectada,
                vi.id_referencia,
                
                m.id AS motorista_id,
                m.nome AS motorista_nome,
                m.cartao_rfid AS motorista_rfid,
                
                r.id AS registro_id,
                r.timestamp AS registro_timestamp,
                r.latitude AS registro_latitude,
                r.longitude AS registro_longitude,
                r.velocidade AS registro_velocidade,
                r.chuva AS registro_chuva,
                r.limite_aplicado AS registro_limite,
                
                a.id AS alerta_id,
                a.timestamp AS alerta_timestamp,
                a.tipo AS alerta_tipo,
                a.descricao AS alerta_descricao,
                a.viagem_id AS alerta_viagem_id,  -- ADICIONADO: ID da viagem relacionada ao alerta
                
                ra.registro_id AS alerta_registro_id

            FROM veiculos v
            LEFT JOIN viagens vi ON vi.veiculo_id = v.id
            LEFT JOIN motoristas m ON m.id = vi.motorista_id
            LEFT JOIN registros r ON r.viagem_id = vi.id
            LEFT JOIN alertas a ON a.viagem_id = vi.id
            LEFT JOIN registros_alertas ra ON ra.alerta_id = a.id AND ra.registro_id = r.id
            
            WHERE v.id = $1
            ORDER BY vi.inicio DESC, r.timestamp ASC, a.timestamp DESC
        `;

        const result = await db.query(query, [veiculoId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'Veículo não encontrado' });
        }

        // Estrutura base do veículo
        const veiculo = {
            id: result.rows[0].veiculo_id,
            identificador: result.rows[0].veiculo_identificador,
            modelo: result.rows[0].veiculo_modelo,
            status: result.rows[0].veiculo_status,
            viagens: []
        };

        // Mapa para agrupar viagens
        const viagensMap = new Map();
        // Mapa para agrupar alertas por viagem
        const alertasMap = new Map();

        result.rows.forEach(row => {
            // Processar viagens
            if (row.viagem_id && !viagensMap.has(row.viagem_id)) {
                viagensMap.set(row.viagem_id, {
                    id: row.viagem_id,
                    inicio: row.viagem_inicio,
                    fim: row.viagem_fim,
                    origem_lat: row.origem_lat,
                    origem_lng: row.origem_lng,
                    destino_lat: row.destino_lat,
                    destino_lng: row.destino_lng,
                    chuva_detectada: row.chuva_detectada,
                    id_referencia: row.id_referencia,
                    motorista: {
                        id: row.motorista_id,
                        nome: row.motorista_nome,
                        cartao_rfid: row.motorista_rfid
                    },
                    registros: [],
                    alertas: []
                });
            }

            // Processar registros
            if (row.registro_id) {
                const viagem = viagensMap.get(row.viagem_id);
                const registro = {
                    id: row.registro_id,
                    timestamp: row.registro_timestamp,
                    latitude: row.registro_latitude,
                    longitude: row.registro_longitude,
                    velocidade: row.registro_velocidade,
                    chuva: row.registro_chuva,
                    limite_aplicado: row.registro_limite
                };

                // Verificar se o registro já foi adicionado
                if (!viagem.registros.some(r => r.id === registro.id)) {
                    viagem.registros.push(registro);
                }
            }

            // Processar alertas
            if (row.alerta_id) {
                const key = `${row.viagem_id}-${row.alerta_id}`;

                if (!alertasMap.has(key)) {
                    alertasMap.set(key, {
                        id: row.alerta_id,
                        timestamp: row.alerta_timestamp,
                        tipo: row.alerta_tipo,
                        descricao: row.alerta_descricao,
                        viagem_id: row.alerta_viagem_id,  // ADICIONADO: ID da viagem relacionada
                        motorista: {
                            id: row.motorista_id,
                            nome: row.motorista_nome,
                            cartao_rfid: row.motorista_rfid
                        },
                        registros: []
                    });
                }

                // Adicionar registro ao alerta se estiver associado
                if (row.alerta_registro_id && row.registro_id) {
                    const alerta = alertasMap.get(key);
                    const registroAlerta = {
                        id: row.registro_id,
                        timestamp: row.registro_timestamp,
                        latitude: row.registro_latitude,
                        longitude: row.registro_longitude,
                        velocidade: row.registro_velocidade,
                        chuva: row.registro_chuva,
                        limite_aplicado: row.registro_limite
                    };

                    if (!alerta.registros.some(r => r.id === registroAlerta.id)) {
                        alerta.registros.push(registroAlerta);
                    }
                }
            }
        });

        // Adicionar alertas às viagens correspondentes
        alertasMap.forEach((alerta, key) => {
            const [viagemId] = key.split('-');
            const viagem = viagensMap.get(parseInt(viagemId));
            if (viagem) {
                viagem.alertas.push(alerta);
            }
        });

        // Adicionar viagens ao veículo
        veiculo.viagens = Array.from(viagensMap.values());

        res.json(veiculo);

    } catch (err) {
        console.error('Erro ao buscar veículo:', err);
        res.status(500).json({ erro: 'Erro interno do servidor' });
    }
});

export default router;