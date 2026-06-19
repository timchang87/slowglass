import express from 'express';
import { SERVER_PORT } from './config.js';
import cors from 'cors';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:8080' }));

app.get('/test', (_req, res) => {
  res.json({ message: 'Hello from the server!' }).status(200);
});

app
  .listen(SERVER_PORT, () => {
    console.log(`✅ Server is running on ${SERVER_PORT || 5000}`);
  })
  .on('error', (err) => {
    console.error('❌ Server failed to start:', err);
  });

export default app;
