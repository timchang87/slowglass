import dotenv from 'dotenv';
import path from 'path';
import { __dirname } from './utils.js';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const getEnvVar = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not defined`);
  }
  return value;
};

// Database configuration
export const POSTGRES_USER = getEnvVar('POSTGRES_USER');
export const POSTGRES_HOST = getEnvVar('POSTGRES_HOST');
export const POSTGRES_DB = getEnvVar('POSTGRES_DB');
export const POSTGRES_PASSWORD = getEnvVar('POSTGRES_PASSWORD');
export const POSTGRES_PORT = getEnvVar('POSTGRES_PORT');
export const POSTGRES_HOST_AUTH_METHOD = getEnvVar('POSTGRES_HOST_AUTH_METHOD');
export const POSTGRES_SSL = getEnvVar('POSTGRES_SSL');

// Server configuration
export const SERVER_PORT = getEnvVar('SERVER_PORT');
