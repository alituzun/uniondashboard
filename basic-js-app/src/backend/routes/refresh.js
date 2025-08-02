const express = require('express');
const router = express.Router();
const database = require('../db/database');

// Function to refresh the database
const refreshDatabase = async () => {
    try {
        // Logic to refresh the database goes here
        // For example, fetching new data and updating the database
        await database.updateData();
        console.log('Database refreshed successfully');
    } catch (error) {
        console.error('Error refreshing the database:', error);
    }
};

// Endpoint to trigger database refresh
router.get('/refresh', (req, res) => {
    refreshDatabase();
    res.status(200).send('Database refresh initiated');
});

// Set up a cron job to refresh the database every 12 hours
setInterval(refreshDatabase, 12 * 60 * 60 * 1000); // 12 hours in milliseconds

module.exports = router;