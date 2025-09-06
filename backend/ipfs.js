import { create as createIPFS } from 'kubo-rpc-client';
import dotenv from 'dotenv';

dotenv.config();

// Use the API URL from .env (no /api/v0 in the client URL)
const ipfs = createIPFS({
  url: process.env.IPFS_API_URL?.replace(/\/api\/v0\/?$/, '') || 'http://127.0.0.1:5001'
});

export default ipfs;
