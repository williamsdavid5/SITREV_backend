import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';

import motoristasRoutes from './routes/motoristas.js';
import viagensRoutes from './routes/viagens.js';
import registrosRoutes from './routes/registros.js';
import alertasRoutes from './routes/alertas.js';
import cercasRoutes from './routes/cercas.js';
import pontosCerca from './routes/pontosCerca.js'
import camadasRouter from './routes/camadas.js';

dotenv.config();

const app = express();
app.use(express.json());

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
}));

app.use('/motoristas', motoristasRoutes);
app.use('/viagens', viagensRoutes);
app.use('/registros', registrosRoutes);
app.use('/alertas', alertasRoutes);
app.use('/cercas', cercasRoutes);
app.use('/pontosCerca', pontosCerca);
app.use('/camadas', camadasRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    const serverUrl = `http://localhost:${PORT}`;
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse: ${serverUrl}`);
});