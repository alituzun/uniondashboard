const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const userRoutes = require('./backend/routes/user');
const refreshRoutes = require('./backend/routes/refresh');

const app = express();
const PORT = process.env.PORT || 3000;

// Add CORS
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


const path = require('path');
app.use('/api/user', userRoutes);
app.use('/api/refresh', refreshRoutes);

// Statik dosyaları sun
app.use(express.static(path.join(__dirname, 'frontend')));

// Ana sayfa için index.html sun (opsiyonel, static ile zaten sunuluyor)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Vercel için export
module.exports = app;

// Local development için
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}