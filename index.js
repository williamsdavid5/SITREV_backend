import express from 'express';
import dotenv from 'dotenv';
import motoristasRoutes from './routes/motoristas.js';

dotenv.config();

const app = express();
app.use(express.json());

app.use('/motoristas', motoristasRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
})