const express = require('express');
const bodyParser = require('body-parser');
const userRoutes = require('./routes/user');
const refreshRoutes = require('./routes/refresh');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Connect to the database
db.connectDB();

// Set up routes
app.use('/api/user', userRoutes);
app.use('/api/refresh', refreshRoutes);

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});