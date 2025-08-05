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

// API Routes
app.use('/api/user', userRoutes);
app.use('/api/refresh', refreshRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'API is running' });
});

// Only export the API (no static serving)
module.exports = app;
