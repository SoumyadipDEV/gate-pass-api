require('dotenv').config();
const sql = require('mssql');

// const config = {
//   server: process.env.MSSQL_SERVER,
//   database: process.env.MSSQL_DATABASE,
//   user: process.env.MSSQL_USER,
//   password: process.env.MSSQL_PASSWORD,
//   options: {
//     encrypt: process.env.MSSQL_ENCRYPT === 'true',
//     trustServerCertificate: process.env.MSSQL_TRUST_SERVER_CERTIFICATE === 'true',
//   },
// };

const config = {
  server: process.env.MSSQL_SERVER,
  port: process.env.MSSQL_PORT ? Number(process.env.MSSQL_PORT) : undefined,
  database: process.env.MSSQL_DATABASE,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: {
    encrypt: process.env.MSSQL_ENCRYPT === 'true',
    trustServerCertificate: process.env.MSSQL_TRUST_SERVER_CERTIFICATE === 'true',
  },
};


let connectionPool = null;

async function getConnection() {
  if (!connectionPool) {
    connectionPool = new sql.ConnectionPool(config);
    await connectionPool.connect();
    console.log('Database connected successfully');
  }
  return connectionPool;
}

async function closeConnection() {
  if (connectionPool) {
    await connectionPool.close();
    connectionPool = null;
  }
}

module.exports = {
  getConnection,
  closeConnection,
  sql,
};
