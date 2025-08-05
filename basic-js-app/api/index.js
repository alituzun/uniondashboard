const express = require('express');
const cors = require('cors');

// Create express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Import routes
const userRoutes = require('../src/backend/routes/user');
const refreshRoutes = require('../src/backend/routes/refresh');

// API Routes - remove /api prefix since we're already in /api
app.use('/user', userRoutes);
app.use('/refresh', refreshRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'API is running' });
});

// Root API endpoint
app.get('/', (req, res) => {
    res.json({ status: 'OK', message: 'Union Dashboard API', version: '1.0.0' });
});

// Export for Vercel
module.exports = app;
