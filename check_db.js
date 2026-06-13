require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
  .then(r => {
    console.log('Tables in DocAI Neon project:');
    r.rows.forEach(row => console.log('  -', row.table_name));
    pool.end();
  })
  .catch(e => { console.error('ERR:', e.message); pool.end(); });
