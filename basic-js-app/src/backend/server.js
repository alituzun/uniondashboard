const express = require('express');
const bodyParser = require('body-parser');
const userRoutes = require('./routes/user');
const refreshRoutes = require('./routes/refresh');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Body parser middleware with encoding options
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Alternative: Use express built-in parsers
// app.use(express.json({ limit: '50mb' }));
// app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Connect to the database
db.connectDB();

// Set up routes
app.use('/api/user', userRoutes);
app.use('/api/refresh', refreshRoutes);

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});