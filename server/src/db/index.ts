import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  POSTGRES_USER,
  POSTGRES_HOST,
  POSTGRES_DB,
  POSTGRES_PASSWORD,
  POSTGRES_PORT,
  POSTGRES_SSL,
} from '../config.js';

let db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!db) {
    const pool = new Pool({
      host: POSTGRES_HOST,
      port: Number(POSTGRES_PORT),
      user: POSTGRES_USER,
      password: POSTGRES_PASSWORD,
      database: POSTGRES_DB,
      ssl: POSTGRES_SSL === 'true',
    });
    db = drizzle(pool);
  }
  return db;
}
