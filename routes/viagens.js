import express from 'express';
import db from '../db.js';

import { DateTime } from 'luxon';

const router = express.Router();

router.get('/limpo', async (_, res) => {
    try {
        const query = `
            SELECT 
                v.id,
                v.inicio AS data_viagem, 
                m.nome AS nome_motorista,
                ve.identificador AS identificador_veiculo,
                ve.modelo AS modelo_veiculo,
                COUNT(a.id) AS quantidade_alertas
            FROM viagens v
            JOIN motoristas m ON v.motorista_id = m.id
            JOIN veiculos ve ON v.veiculo_id = ve.id
            LEFT JOIN alertas a ON a.viagem_id = v.id
            GROUP BY v.id, v.inicio, m.nome, ve.identificador, ve.modelo
            ORDER BY v.inicio DESC
        `;

        const { rows } = await db.query(query);

        res.status(200).json(rows);
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

// helper: parse para Brasília; retorna null se inválido
// function toBrasiliaOrNull(iso) {
//     if (!iso) return null;
//     const dt = DateTime.fromISO(iso, { setZone: true }); // respeita 'Z' do ISO
//     if (!dt.isValid) return null;
//     return dt.setZone('America/Sao_Paulo').toISO({ suppressMilliseconds: true });
// }

// encontra primeiro e último registros VÁLIDOS
function toBrasiliaOrNull(iso) {
    if (!iso) return null;

    const dt = DateTime.fromISO(iso, { setZone: true }); // respeita 'Z' do ISO
    if (!dt.isValid) return null;

    return dt.setZone('America/Sao_Paulo').toISO({ suppressMilliseconds: true });
}

// encontra primeiro registro VÁLIDO
function firstValid(registros) {
    for (let i = 0; i < registros.length; i++) {
        const ts = toBrasiliaOrNull(registros[i].timestamp);
        if (ts) return { idx: i, ts };
    }
    return null;
}

// encontra último registro VÁLIDO
function lastValid(registros) {
    for (let i = registros.length - 1; i >= 0; i--) {
        const ts = toBrasiliaOrNull(registros[i].timestamp);
        if (ts) return { idx: i, ts };
    }
    return null;
}

router.post('/registrar-viagem', async (req, res) => {
    const dados = req.body;

    if (!dados || !Array.isArray(dados.registros) || dados.registros.length === 0) {
        return res.status(400).json({ erro: 'JSON inválido ou sem registros' });
    }

    try {
        // calcula início/fim/dados de origem/destino a partir de registros VÁLIDOS
        const ini = firstValid(dados.registros);
        const fimv = lastValid(dados.registros);

        if (!ini || !fimv) {
            return res.status(400).json({ erro: 'Nenhum timestamp válido encontrado nos registros' });
        }

        const origem = dados.registros[ini.idx];
        const destino = dados.registros[fimv.idx];
        let viagemId;

        // procura viagem por id_referencia
        const viagemExistente = await db.query(
            'SELECT id, chuva_detectada FROM viagens WHERE id_referencia = $1',
            [dados.viagem_id]
        );

        const chuva_detectada = dados.registros.some(r => r.chuva === true);

        if (viagemExistente.rows.length > 0) {
            viagemId = viagemExistente.rows[0].id;
            await db.query(
                `UPDATE viagens
                 SET fim = GREATEST(COALESCE(fim, $1), $1),
                     destino_lat = $2,
                     destino_lng = $3,
                     chuva_detectada = COALESCE(chuva_detectada, false) OR $4
                 WHERE id = $5`,
                [fimv.ts, destino.lat, destino.lng, chuva_detectada, viagemId]
            );
        } else {
            const viagemResult = await db.query(
                `INSERT INTO viagens
                 (motorista_id, veiculo_id, inicio, fim, origem_lat, origem_lng, destino_lat, destino_lng, chuva_detectada, id_referencia)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 RETURNING id`,
                [
                    dados.motorista_id,
                    dados.veiculo_id,
                    ini.ts,
                    fimv.ts,
                    origem.lat,
                    origem.lng,
                    destino.lat,
                    destino.lng,
                    chuva_detectada,
                    dados.viagem_id
                ]
            );
            viagemId = viagemResult.rows[0].id;
        }

        // monta INSERT em lote apenas com registros de timestamp válido
        const values = [];
        const params = [];
        let i = 1;

        const registrosValidos = []; // armazenar os registros válidos

        for (const r of dados.registros) {
            const ts = toBrasiliaOrNull(r.timestamp);
            if (!ts) continue;

            values.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6})`);
            params.push(viagemId, dados.veiculo_id, ts, r.lat, r.lng, r.vel, r.chuva);

            registrosValidos.push({ ...r, ts }); // guardar para análise de alertas
            i += 7;
        }

        let insertedRegistros = [];
        if (values.length > 0) {
            const result = await db.query(
                `INSERT INTO registros (viagem_id, veiculo_id, timestamp, latitude, longitude, velocidade, chuva)
                 VALUES ${values.join(',')}
                 ON CONFLICT DO NOTHING
                 RETURNING id, timestamp, latitude, longitude, velocidade`,
                params
            );
            insertedRegistros = result.rows;
        }

        const historicoRes = await db.query(
            `SELECT timestamp, latitude AS lat, longitude AS lng, velocidade AS vel, chuva
            FROM registros
            WHERE viagem_id = $1
            ORDER BY timestamp DESC
            LIMIT 5`, // pega os últimos 5 registros, suficiente pra detectar continuidade
            [viagemId]
        );

        const historico = historicoRes.rows.reverse(); // coloca em ordem cronológica

        // Junta o histórico com os novos
        const registrosComContexto = [...historico, ...registrosValidos];

        // remove possíveis duplicatas (mesmo timestamp)
        const mapa = new Map();
        for (const r of registrosComContexto) mapa.set(r.ts, r);
        const registrosAnalise = Array.from(mapa.values()).sort((a, b) => new Date(a.ts) - new Date(b.ts));

        // substitui registrosValidos por registrosAnalise
        console.log(`🧩 Incluídos ${historico.length} registros anteriores para contexto de análise`);


        // ---- DETECÇÃO DE ALERTAS DE VELOCIDADE ----
        console.log('=== DETECÇÃO DE ALERTAS DE VELOCIDADE ===');
        console.log(`Registros válidos para análise (com contexto): ${registrosAnalise.length}`);

        let alertaAtual = null;
        const blocosAlerta = [];

        for (let idx = 0; idx < registrosValidos.length; idx++) {
            const r = registrosValidos[idx];
            const limite = r.chuva ? r.lim_chuva : r.lim_seco;
            const acimaLimite = r.vel > limite;

            if (acimaLimite) {
                // Inicia ou continua um bloco de alerta
                if (!alertaAtual) {
                    alertaAtual = {
                        registros: [],
                        inicio: r.ts,
                        velocidadeMaxima: r.vel,
                        primeiroRegistro: r
                    };
                    console.log(`🚨 INICIANDO BLOCO - Registro ${idx}: ${r.vel}km/h > ${limite}km/h (${r.timestamp})`);
                }
                alertaAtual.registros.push({ ...r, index: idx });

                // Atualiza velocidade máxima do bloco
                if (r.vel > alertaAtual.velocidadeMaxima) {
                    alertaAtual.velocidadeMaxima = r.vel;
                }

            } else {
                // Finaliza o bloco atual se existir E tiver pelo menos 2 registros
                if (alertaAtual && alertaAtual.registros.length >= 2) {
                    console.log(`✅ FINALIZANDO BLOCO - ${alertaAtual.registros.length} registros, vel máxima: ${alertaAtual.velocidadeMaxima}km/h`);
                    blocosAlerta.push(alertaAtual);
                } else if (alertaAtual) {
                    console.log(`⚠️  DESCARTANDO BLOCO - Apenas ${alertaAtual.registros.length} registro(s), mínimo não atingido`);
                }
                alertaAtual = null;
            }
        }

        // Captura o último bloco se ainda estiver ativo E tiver pelo menos 2 registros
        if (alertaAtual) {
            if (alertaAtual.registros.length >= 2) {
                console.log(`✅ FINALIZANDO ÚLTIMO BLOCO - ${alertaAtual.registros.length} registros, vel máxima: ${alertaAtual.velocidadeMaxima}km/h`);
                blocosAlerta.push(alertaAtual);
            } else {
                console.log(`⚠️  DESCARTANDO ÚLTIMO BLOCO - Apenas ${alertaAtual.registros.length} registro(s), mínimo não atingido`);
            }
        }

        console.log(`📊 TOTAL DE BLOCOS DETECTADOS: ${blocosAlerta.length}`);

        // INSERIR ALERTAS NO BANCO
        let alertasCriados = 0;
        let registrosVinculados = 0;

        // INSERIR ALERTAS NO BANCO (substituir a lógica de vinculação atual)
        for (const [blocoIndex, bloco] of blocosAlerta.entries()) {
            console.log(`\n📝 PROCESSANDO BLOCO ${blocoIndex + 1}:`);
            console.log(`   📍 ${bloco.registros.length} registros consecutivos`);
            console.log(`   🕒 Início: ${bloco.inicio}`);
            console.log(`   🚗 Velocidade máxima: ${bloco.velocidadeMaxima}km/h`);
            console.log(`   📍 Primeiro registro: ${bloco.registros[0].lat}, ${bloco.registros[0].lng}`);

            // Evitar criar alerta duplicado (mesma viagem, mesmo timestamp aproximado e mesmo tipo)
            const alertaExistente = await db.query(
                `SELECT id FROM alertas
                WHERE viagem_id = $1 AND tipo = $2
                AND timestamp BETWEEN ($3::timestamp - INTERVAL '5 seconds') AND ($3::timestamp + INTERVAL '5 seconds')
                LIMIT 1`,
                [viagemId, 'limite_velocidade', bloco.registros[0].ts]
            );

            if (alertaExistente.rows.length > 0) {
                console.log(`   ⚠️ Alerta já existe (id ${alertaExistente.rows[0].id}) para este bloco, pulando criação.`);
                continue;
            }

            // Criar alerta no banco
            const alertaRes = await db.query(
                `INSERT INTO alertas (viagem_id, veiculo_id, timestamp, tipo, descricao)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id`,
                [
                    viagemId,
                    dados.veiculo_id,
                    bloco.registros[0].ts,
                    'limite_velocidade',
                    `Excesso de velocidade por ${bloco.registros.length} registros consecutivos. Velocidade máxima: ${bloco.velocidadeMaxima}km/h`
                ]
            );

            const alertaId = alertaRes.rows[0].id;
            alertasCriados++;
            console.log(`   ✅ Alerta ${alertaId} criado`);

            // --- BUSCAR TODOS OS REGISTROS DO BANCO QUE PERTENCEM AO INTERVALO DO BLOCO ---
            // Determinar janela de tempo do bloco (do primeiro ao último registro) com padding
            const tsPrimeiro = bloco.registros[0].ts;
            const tsUltimo = bloco.registros[bloco.registros.length - 1].ts;
            // adicionar padding (5s) para cobrir pequenas diferenças de timestamp
            const paddingSeconds = 5;

            const registrosDbRes = await db.query(
                `SELECT id, timestamp, latitude, longitude
                FROM registros
                WHERE viagem_id = $1
                AND timestamp BETWEEN ($2::timestamp - INTERVAL '${paddingSeconds} seconds')
                                AND ($3::timestamp + INTERVAL '${paddingSeconds} seconds')`,
                [viagemId, tsPrimeiro, tsUltimo]
            );


            const registrosDb = registrosDbRes.rows;
            console.log(`   🔍 Registros no DB no intervalo: ${registrosDb.length}`);

            // Para cada registro do bloco, encontre o registro DB mais próximo (por tempo) e com lat/lng dentro de tolerância
            const TOLERANCIA_LATLNG = 0.00015; // ~16m, ajuste se necessário

            let vinculosEsteBloco = 0;
            for (const registro of bloco.registros) {
                // encontra candidato com menor diferença de timestamp (em ms)
                let melhor = null;
                let melhorDiff = Infinity;
                const tsRegistro = new Date(registro.ts).getTime();

                for (const dbReg of registrosDb) {
                    const dbTs = new Date(dbReg.timestamp).getTime();
                    const diff = Math.abs(dbTs - tsRegistro);
                    if (diff < melhorDiff) {
                        // checa proximidade geográfica
                        if (Math.abs(Number(dbReg.latitude) - Number(registro.lat)) <= TOLERANCIA_LATLNG &&
                            Math.abs(Number(dbReg.longitude) - Number(registro.lng)) <= TOLERANCIA_LATLNG) {
                            melhor = dbReg;
                            melhorDiff = diff;
                        }
                    }
                }

                if (melhor) {
                    try {
                        await db.query(
                            `INSERT INTO registros_alertas (alerta_id, registro_id)
                        VALUES ($1, $2)
                        ON CONFLICT DO NOTHING`,
                            [alertaId, melhor.id]
                        );
                        vinculosEsteBloco++;
                        registrosVinculados++;
                    } catch (err) {
                        console.log(`   ⚠️ Erro ao vincular registro ${melhor.id} ao alerta ${alertaId}:`, err.message);
                    }
                } else {
                    console.log(`   ⚠️ Nenhum registro DB encontrado para vincular ao timestamp ${registro.timestamp}`);
                }
            }

            console.log(`   🔗 ${vinculosEsteBloco}/${bloco.registros.length} registros vinculados ao alerta ${alertaId}`);
        }


        // LOG FINAL
        console.log('\n=== RESUMO FINAL ===');
        console.log(`📁 Viagem ID: ${viagemId}`);
        console.log(`📊 Registros processados: ${registrosValidos.length}`);
        console.log(`📊 Registros inseridos: ${insertedRegistros.length}`);
        console.log(`🚨 Alertas criados: ${alertasCriados}`);
        console.log(`🔗 Registros vinculados: ${registrosVinculados}`);
        console.log(`📦 Blocos detectados: ${blocosAlerta.length}`);

        // Log detalhado dos blocos para debug
        blocosAlerta.forEach((bloco, index) => {
            console.log(`   Bloco ${index + 1}: ${bloco.registros.length} registros, vel max: ${bloco.velocidadeMaxima}km/h`);
        });

        res.json({
            sucesso: true,
            viagem_id: viagemId,
            alertas: alertasCriados,
            detalhes: {
                registros_processados: registrosValidos.length,
                registros_inseridos: insertedRegistros.length,
                blocos_detectados: blocosAlerta.length,
                alertas_criados: alertasCriados,
                registros_vinculados: registrosVinculados
            }
        });

    } catch (err) {
        console.error('Erro ao registrar viagem:', err);
        res.status(500).json({ erro: 'Erro ao registrar viagem' });
    }
});





export default router;