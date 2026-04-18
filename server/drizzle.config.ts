import { defineConfig } from 'drizzle-kit';
import {
  POSTGRES_USER,
  POSTGRES_HOST,
  POSTGRES_DB,
  POSTGRES_PASSWORD,
  POSTGRES_PORT,
  POSTGRES_SSL,
} from './src/config.js';

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schemas/*.ts',
  dialect: 'postgresql',
  dbCredentials: {
    host: POSTGRES_HOST,
    port: Number(POSTGRES_PORT),
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    database: POSTGRES_DB,
    ssl: POSTGRES_SSL === 'true',
  },
  migrations: {
    table: 'refresh_migrations',
    schema: 'internal',
  },
});
