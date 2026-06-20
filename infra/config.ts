import { config } from 'dotenv';

config();

const AWS_ACCOUNT = process.env.AWS_ACCOUNT;
const AWS_REGION = process.env.AWS_REGION;

export { AWS_ACCOUNT, AWS_REGION };
