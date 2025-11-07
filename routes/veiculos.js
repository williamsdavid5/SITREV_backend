import express from 'express';
import path from 'path';
import fs from 'fs';
import puppeteer from 'puppeteer';
import db from '../db.js';
// import sitrevLogo from '../assets/img/SITREV_LOGO.jpg'

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
                r.timestamp as ultima_leitura,
                m.id as motorista_id,
                m.nome as motorista_nome
            FROM veiculos v
            LEFT JOIN viagens vi ON vi.veiculo_id = v.id
            LEFT JOIN registros r ON r.viagem_id = vi.id
            LEFT JOIN motoristas m ON m.id = vi.motorista_id
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
            ultima_leitura: row.ultima_leitura,
            motorista: row.motorista_id ? {
                id: row.motorista_id,
                nome: row.motorista_nome
            } : null
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

router.get('/relatorio/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // 🔹 Consulta o veículo
        const veiculoQuery = `
            SELECT 
                v.id, v.identificador, v.modelo, v.status,
                (SELECT COUNT(*) FROM viagens WHERE veiculo_id = v.id) AS total_viagens,
                (SELECT COUNT(*) FROM alertas WHERE veiculo_id = v.id) AS total_alertas,
                (SELECT MAX(r.timestamp) FROM registros r WHERE r.veiculo_id = v.id) AS ultimo_registro,
                (SELECT m.nome FROM motoristas m
                    JOIN viagens vi ON vi.motorista_id = m.id
                    WHERE vi.veiculo_id = v.id
                    ORDER BY vi.inicio DESC
                    LIMIT 1) AS ultimo_motorista
            FROM veiculos v
            WHERE v.id = $1
        `;
        const { rows: veiculos } = await db.query(veiculoQuery, [id]);
        if (!veiculos.length) return res.status(404).json({ erro: 'Veículo não encontrado' });
        const veiculo = veiculos[0];

        // 🔹 Consulta viagens
        const viagensQuery = `
            SELECT 
                vi.id, vi.inicio, vi.fim, vi.chuva_detectada,
                vi.origem_lat, vi.origem_lng, vi.destino_lat, vi.destino_lng,
                m.nome AS motorista, m.cartao_rfid,
                COALESCE((SELECT COUNT(*) FROM alertas a WHERE a.viagem_id = vi.id), 0) AS total_alertas
            FROM viagens vi
            LEFT JOIN motoristas m ON vi.motorista_id = m.id
            WHERE vi.veiculo_id = $1
            ORDER BY vi.inicio DESC
        `;
        const { rows: viagens } = await db.query(viagensQuery, [id]);

        // 🔹 Consulta alertas
        const alertasQuery = `
            SELECT 
                a.id, a.tipo, a.descricao, a.timestamp AS data,
                a.viagem_id,
                (SELECT COUNT(*) FROM registros_alertas ra WHERE ra.alerta_id = a.id) AS qtd_registros,
                (SELECT r.latitude FROM registros r
                 JOIN registros_alertas ra ON ra.registro_id = r.id
                 WHERE ra.alerta_id = a.id LIMIT 1) AS latitude,
                (SELECT r.longitude FROM registros r
                 JOIN registros_alertas ra ON ra.registro_id = r.id
                 WHERE ra.alerta_id = a.id LIMIT 1) AS longitude
            FROM alertas a
            WHERE a.veiculo_id = $1
            ORDER BY a.timestamp DESC
        `;
        const { rows: alertas } = await db.query(alertasQuery, [id]);

        // 🔹 Lê o HTML base
        const templatePath = path.resolve('./views/relatorio-veiculo.html');
        let html = fs.readFileSync(templatePath, 'utf8');

        // 🔹 Monta blocos de viagens
        const formatarData = (data) => data ? new Date(data).toLocaleString('pt-BR') : '—';

        let viagensHTML = '';
        for (const v of viagens) {
            const alertasDaViagem = alertas.filter(a => a.viagem_id === v.id);

            let alertasHTML = '';
            for (const a of alertasDaViagem) {
                alertasHTML += `
                    <p><strong>- Alerta ${a.id}:</strong> ${a.tipo} (${formatarData(a.data)})</p>
                    <p><strong>Descrição:</strong> ${a.descricao || '—'}</p>
                    <p><strong>Local (maps):</strong> <a href="https://www.google.com/maps?q=${a.latitude},${a.longitude}" target="_blank">Ver no mapa</a></p>
                    <p><strong>Registros associados:</strong> ${a.qtd_registros}</p>
                `;
            }

            viagensHTML += `
                <div class="viagem">
                    <p><strong>Viagem ${v.id}</strong></p>
                    <p><strong>Início:</strong> ${formatarData(v.inicio)}</p>
                    <p><strong>Fim:</strong> ${formatarData(v.fim)}</p>
                    <p><strong>Motorista:</strong> ${v.motorista || '—'}</p>
                    <p><strong>RFID:</strong> ${v.cartao_rfid || '—'}</p>
                    <p><strong>Chuva detectada:</strong> ${v.chuva_detectada ? 'Sim' : 'Não'}</p>
                    <p><strong>Início (maps):</strong> <a href="https://www.google.com/maps?q=${v.origem_lat},${v.origem_lng}" target="_blank">Ver no mapa</a></p>
                    <p><strong>Fim (maps):</strong> <a href="https://www.google.com/maps?q=${v.destino_lat},${v.destino_lng}" target="_blank">Ver no mapa</a></p>
                    <p><strong>Alertas na viagem:</strong> ${v.total_alertas}</p>
                    <div class="alertas">${alertasHTML || '<p>Nenhum alerta registrado</p>'}</div>
                </div>
                <hr/>
            `;
        }

        const dataEmissao = new Date().toLocaleString('pt-BR');

        // 🔹 Substitui os placeholders do HTML
        html = html
            .replace('{{DATA_EMISSAO}}', dataEmissao)
            .replace('{{ID}}', veiculo.id)
            .replace('{{IDENTIFICADOR}}', veiculo.identificador)
            .replace('{{MODELO}}', veiculo.modelo)
            .replace('{{STATUS}}', veiculo.status)
            .replace('{{TOTAL_VIAGENS}}', veiculo.total_viagens)
            .replace('{{TOTAL_ALERTAS}}', veiculo.total_alertas)
            .replace('{{ULTIMO_REGISTRO}}', formatarData(veiculo.ultimo_registro))
            .replace('{{ULTIMO_MOTORISTA}}', veiculo.ultimo_motorista || '—')
            .replace('{{LISTA_VIAGENS}}', viagensHTML || '<p>Nenhuma viagem registrada</p>');

        // 🔹 Gera o PDF

        // 🧠 Detecta se está rodando no Render (Linux) ou local
        const isRender = process.env.RENDER === 'true' || process.env.NODE_ENV === 'production';

        const launchOptions = isRender
            ? {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-zygote',
                    '--single-process',
                ],
            }
            : {
                headless: 'new', // modo estável no Windows
            };

        const browser = await puppeteer.launch(launchOptions);


        const page = await browser.newPage();

        const tempFilePath = path.resolve('./temp_relatorio.html');
        fs.writeFileSync(tempFilePath, html, 'utf8');

        await page.goto('file://' + tempFilePath, { waitUntil: ['load', 'networkidle0'] });
        await page.emulateMediaType('screen');


        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' }
        });

        await browser.close();
        fs.unlinkSync(tempFilePath);

        // 🔹 Retorna o PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="relatorio_veiculo_${veiculo.identificador}.pdf"`);
        res.send(pdfBuffer);



    } catch (erro) {
        console.error('Erro ao gerar relatório:', erro);
        res.status(500).json({ erro: 'Erro ao gerar relatório' });
    }
});









export default router;