import express from 'express';
import dotenv from 'dotenv';

import motoristasRoutes from './routes/motoristas.js';
// import viagensRoutes from './routes/viagens.js';
// import registrosRoutes from './routes/registros.js';
// import alertasRoutes from './routes/alertas.js';
// import cercasRoutes from './routes/cercas.js';

dotenv.config();

const app = express();
app.use(express.json());

app.use('/motoristas', motoristasRoutes);
// app.use('/viagens', viagensRoutes);
// app.use('/registros', registrosRoutes);
// app.use('/alertas', alertasRoutes);
// app.use('/cercas', cercasRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
})