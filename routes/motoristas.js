import express from 'express';
import db from '../db.js';

import puppeteer from 'puppeteer';
import chromium from '@sparticuz/chromium';

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
                `SELECT r.latitude, r.longitude, r.timestamp, r.velocidade, r.limite_aplicado
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

router.get('/relatorio/:id', async (req, res) => {
    const { id } = req.params;
    const { tipo = 'completo', inicio, fim } = req.query; // 🔹 ADICIONAR ESTA LINHA
    let browser;

    try {
        // 🔹 Consulta motorista (COM ÚLTIMO VEÍCULO)
        const motoristaQuery = `
            SELECT 
                m.id, m.nome, m.cartao_rfid,
                (SELECT COUNT(*) FROM viagens WHERE motorista_id = m.id) AS total_viagens,
                (SELECT COUNT(*) FROM alertas a 
                 JOIN viagens v ON v.id = a.viagem_id 
                 WHERE v.motorista_id = m.id) AS total_alertas,
                (SELECT MAX(inicio) FROM viagens WHERE motorista_id = m.id) AS ultima_viagem,
                (SELECT v.id FROM veiculos v
                 JOIN viagens vi ON vi.veiculo_id = v.id
                 WHERE vi.motorista_id = m.id
                 ORDER BY vi.inicio DESC
                 LIMIT 1) AS ultimo_veiculo_id,
                (SELECT v.identificador FROM veiculos v
                 JOIN viagens vi ON vi.veiculo_id = v.id
                 WHERE vi.motorista_id = m.id
                 ORDER BY vi.inicio DESC
                 LIMIT 1) AS ultimo_veiculo_identificador,
                (SELECT v.modelo FROM veiculos v
                 JOIN viagens vi ON vi.veiculo_id = v.id
                 WHERE vi.motorista_id = m.id
                 ORDER BY vi.inicio DESC
                 LIMIT 1) AS ultimo_veiculo_modelo
            FROM motoristas m
            WHERE m.id = $1
        `;
        const { rows: motoristas } = await db.query(motoristaQuery, [id]);
        if (!motoristas.length) return res.status(404).json({ erro: 'Motorista não encontrado' });
        const motorista = motoristas[0];

        // 🔹 Função para converter data dd/mm/aaaa para formato ISO
        const converterData = (dataString, ehFim = false) => {
            if (!dataString) return null;

            const [dia, mes, ano] = dataString.split('/');
            if (!dia || !mes || !ano) return null;

            // Garante que o ano tenha 4 dígitos
            const anoCompleto = ano.length === 2 ? `20${ano}` : ano;

            // Para a data final, adiciona 23:59:59 para incluir todo o dia
            if (ehFim) {
                return `${anoCompleto}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T23:59:59.999Z`;
            }

            return `${anoCompleto}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T00:00:00.000Z`;
        };

        // 🔹 Monta filtro de data (se existir)
        let filtroData = "";
        const params = [id];

        const dataInicioISO = converterData(inicio, false);
        const dataFimISO = converterData(fim, true);

        if (dataInicioISO && dataFimISO) {
            filtroData = `AND vi.inicio BETWEEN $2 AND $3`;
            params.push(dataInicioISO, dataFimISO);
        } else if (dataInicioISO) {
            filtroData = `AND vi.inicio >= $2`;
            params.push(dataInicioISO);
        } else if (dataFimISO) {
            filtroData = `AND vi.inicio <= $2`;
            params.push(dataFimISO);
        }

        // 🔹 Consulta viagens do motorista (COM FILTROS)
        let viagensQuery = `
            SELECT 
                vi.id, vi.inicio, vi.fim, vi.chuva_detectada,
                vi.origem_lat, vi.origem_lng, vi.destino_lat, vi.destino_lng,
                v.id AS veiculo_id,
                v.identificador AS veiculo_identificador,
                v.modelo AS veiculo_modelo,
                COALESCE((SELECT COUNT(*) FROM alertas a WHERE a.viagem_id = vi.id), 0) AS total_alertas
            FROM viagens vi
            LEFT JOIN veiculos v ON vi.veiculo_id = v.id
            WHERE vi.motorista_id = $1
            ${filtroData}
            ORDER BY vi.inicio DESC
        `;

        if (tipo === 'resumido') {
            viagensQuery += ` LIMIT 1`;
        }

        const { rows: viagens } = await db.query(viagensQuery, params);

        // 🔹 Consulta alertas do motorista (COM FILTROS)
        let alertasQuery = `
            SELECT 
                a.id, a.tipo, a.descricao, a.timestamp AS data,
                a.viagem_id,
                v.id AS veiculo_id,
                v.identificador AS veiculo_identificador,
                v.modelo AS veiculo_modelo,
                (SELECT COUNT(*) FROM registros_alertas ra WHERE ra.alerta_id = a.id) AS qtd_registros,
                (SELECT r.latitude FROM registros r
                 JOIN registros_alertas ra ON ra.registro_id = r.id
                 WHERE ra.alerta_id = a.id LIMIT 1) AS latitude,
                (SELECT r.longitude FROM registros r
                 JOIN registros_alertas ra ON ra.registro_id = r.id
                 WHERE ra.alerta_id = a.id LIMIT 1) AS longitude
            FROM alertas a
            JOIN viagens vi ON vi.id = a.viagem_id
            JOIN veiculos v ON vi.veiculo_id = v.id
            WHERE vi.motorista_id = $1
            ${tipo === 'resumido' && viagens.length > 0 ? `AND a.viagem_id = $2` : ""}
            ORDER BY a.timestamp DESC
        `;

        const alertasParams = [id];
        if (tipo === 'resumido' && viagens.length > 0) {
            alertasParams.push(viagens[0].id);
        }

        const { rows: alertas } = await db.query(alertasQuery, alertasParams);

        // 🔹 Lê o HTML base
        const templatePath = path.resolve('./views/relatorio-motorista.html');
        let html = fs.readFileSync(templatePath, 'utf8');

        // 🔹 Monta blocos HTML
        const formatarData = (data) => {
            if (!data) return '—';
            return new Date(data).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        };

        let viagensHTML = '';
        for (const v of viagens) {
            const alertasDaViagem = alertas.filter(a => a.viagem_id === v.id);
            const alertasHTML = alertasDaViagem.map(a => `
                <div class="alerta">
                    <p><strong>- Alerta ${a.id}:</strong> ${a.tipo} (${formatarData(a.data)})</p>
                    <p><strong>Descrição:</strong> ${a.descricao || '—'}</p>
                    <p><strong>Veículo:</strong> ${a.veiculo_identificador} (${a.veiculo_modelo}) - ID: ${a.veiculo_id}</p>
                    <p><strong>Local:</strong> <a href="https://www.google.com/maps?q=${a.latitude},${a.longitude}" target="_blank">Ver no mapa</a></p>
                    <p><strong>Registros:</strong> ${a.qtd_registros}</p>
                </div>
            `).join('');

            viagensHTML += `
                <div class="bloco-viagem">
                    <p><strong>Viagem ${v.id}</strong></p>
                    <p><strong>Início:</strong> ${formatarData(v.inicio)}</p>
                    <p><strong>Fim:</strong> ${formatarData(v.fim)}</p>
                    <p><strong>Veículo ID:</strong> ${v.veiculo_id || '—'}</p>
                    <p><strong>Veículo:</strong> ${v.veiculo_identificador || '—'}</p>
                    <p><strong>Modelo:</strong> ${v.veiculo_modelo || '—'}</p>
                    <p><strong>Chuva:</strong> ${v.chuva_detectada ? 'Sim' : 'Não'}</p>
                    <p><strong>Origem:</strong> <a href="https://www.google.com/maps?q=${v.origem_lat},${v.origem_lng}" target="_blank">Ver no mapa</a></p>
                    <p><strong>Destino:</strong> <a href="https://www.google.com/maps?q=${v.destino_lat},${v.destino_lng}" target="_blank">Ver no mapa</a></p>
                    <p><strong>Alertas:</strong> ${v.total_alertas}</p>
                    <div class="alertas">${alertasHTML || '<p>Nenhum alerta registrado</p>'}</div>
                </div>
                <hr/>
            `;
        }

        // 🔹 Adiciona informações do filtro no relatório
        const infoFiltro = [];
        if (tipo === 'resumido') {
            infoFiltro.push('Relatório Resumido (última viagem)');
        } else {
            infoFiltro.push('Relatório Completo');
        }

        if (inicio && fim) {
            infoFiltro.push(`Período: ${inicio} a ${fim}`);
        } else if (inicio) {
            infoFiltro.push(`A partir de: ${inicio}`);
        } else if (fim) {
            infoFiltro.push(`Até: ${fim}`);
        }

        const dataEmissao = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        html = html
            .replace('{{DATA_EMISSAO}}', dataEmissao)
            .replace('{{ID}}', motorista.id)
            .replace('{{NOME}}', motorista.nome)
            .replace('{{CARTAO}}', motorista.cartao_rfid)
            .replace('{{TOTAL_VIAGENS}}', motorista.total_viagens)
            .replace('{{TOTAL_ALERTAS}}', motorista.total_alertas)
            .replace('{{ULTIMA_VIAGEM}}', formatarData(motorista.ultima_viagem))
            .replace('{{ULTIMO_VEICULO_ID}}', motorista.ultimo_veiculo_id || '—')
            .replace('{{ULTIMO_VEICULO_IDENTIFICADOR}}', motorista.ultimo_veiculo_identificador || '—')
            .replace('{{ULTIMO_VEICULO_MODELO}}', motorista.ultimo_veiculo_modelo || '—')
            .replace('{{LISTA_VIAGENS}}', viagensHTML || '<p>Nenhuma viagem registrada</p>')
            .replace('{{INFO_FILTRO}}', infoFiltro.length > 0 ? `<p><strong>Filtros aplicados:</strong> ${infoFiltro.join(' | ')}</p>` : '');

        // 🔹 Lógica do Puppeteer (simplificada)
        const isRender = !!process.env.RENDER;
        const launchOptions = isRender
            ? {
                args: chromium.args,
                executablePath: await chromium.executablePath(),
                headless: chromium.headless
            }
            : { headless: true };

        const puppeteerLib = isRender
            ? (await import('puppeteer-core')).default
            : (await import('puppeteer')).default;

        browser = await puppeteerLib.launch(launchOptions);
        const page = await browser.newPage();

        await page.setContent(html, { waitUntil: 'load' });
        await new Promise(r => setTimeout(r, 500));

        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' }
        });

        await browser.close();

        // Enviar PDF
        res.setHeader('Content-Type', 'application/pdf');

        // Nome do arquivo com informações do filtro
        let filename = `relatorio_motorista_${motorista.nome.replace(/\s+/g, '_')}`;
        if (tipo === 'resumido') filename += '_resumido';
        if (inicio) filename += `_de_${inicio.replace(/\//g, '-')}`;
        if (fim) filename += `_ate_${fim.replace(/\//g, '-')}`;
        filename += '.pdf';

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(pdf);

    } catch (erro) {
        console.error('Erro ao gerar relatório do motorista:', erro);
        if (browser) await browser.close();
        res.status(500).json({ erro: 'Falha ao gerar relatório', detalhes: erro.message });
    }
});

export default router;