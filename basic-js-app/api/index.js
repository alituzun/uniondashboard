const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// CORS
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Import routes
const userRoutes = require('../src/backend/routes/user');
const refreshRoutes = require('../src/backend/routes/refresh');

// Routes
app.use('/api/user', userRoutes);
app.use('/api/refresh', refreshRoutes);

// Static files
app.use(express.static(path.join(__dirname, '../src/frontend')));

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../src/frontend', 'index.html'));
});

// Catch all route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../src/frontend', 'index.html'));
});

module.exports = app;
