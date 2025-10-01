import dotenv from "dotenv";
dotenv.config({ path: `.env` });

import bodyParser from 'body-parser';
import cors from 'cors';

import express from 'express';
import { connectDB } from './db/connect';

// import routes
import indexRouter from './routes/index';
import usersRouter from './routes/users';
import loginRouter from './routes/login';
import objectsRouter from './routes/objects';
import syncRouter from './routes/sync';

const app = express();
const port = process.env.API_PORT;

app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));


app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/login', loginRouter);
app.use('/objects', objectsRouter);
app.use('/sync', syncRouter);

app.listen(port, () => {
  connectDB();
  console.log(`Baseline back on localhost:${port}`)
})

module.exports = app;