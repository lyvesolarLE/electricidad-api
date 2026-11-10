import { Pool } from 'pg';
import { config } from '../config.js'; 

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 30000, // 30 segundos de espera máxima
  idleTimeoutMillis: 30000,
  max: 10
});