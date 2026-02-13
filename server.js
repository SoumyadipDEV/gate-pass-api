const express = require('express');
const cors = require('cors');
require('dotenv').config();

const apiRoutes = require('./routes/api');
const { getConnection } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
  });
});

// Request logging middleware
app.use((req, res, next) => {
  const userHeader = req.headers['x-user'];
  const path = req.path;
  const body = req.body;
  console.log(`Request Path: ${path}, User: ${userHeader || 'Anonymous'}, Body: ${JSON.stringify(body)}`);
  next();
});

// API routes
app.use('/api', apiRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
  });
});

// Initialize database connection and start server
async function startServer() {
  try {
    // Test database connection
    await getConnection();

    app.listen(PORT, () => {
      console.log(`Gate Pass API Server running on port ${PORT}`);
      console.log(`
  ========================================
  Gate Pass API Server Started
  ========================================
  
  Health Check: http://localhost:${PORT}/health
  
  Endpoints:
  - POST   /api/createlogin     - Create login user
  - POST   /api/auth/login       - User login
  - GET    /api/gatepass         - Get all gate passes
  - POST   /api/gatepass         - Create gate pass
  - PATCH  /api/gatepass         - Update gate pass
  - DELETE /api/gatepassdelete/:id - Delete gate pass
  - POST   /api/dest/create      - Create destination
  - GET    /api/dest             - List destinations
  
  ========================================
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  const { closeConnection } = require('./config/database');
  await closeConnection();
  process.exit(0);
});

startServer();

module.exports = app;
