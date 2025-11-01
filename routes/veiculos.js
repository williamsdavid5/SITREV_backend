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
export default router;