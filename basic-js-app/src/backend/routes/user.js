// Gerekli modüller sadece en başta tanımlanır
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Yeni endpoint: username ile leaderboard_full.json'dan total_xp ve pfp, yaps_season_one.json'dan mindshare döndür
router.get('/get-user-summary/:username', async (req, res) => {
    const username = req.params.username;
    const leaderboardPath = path.join(__dirname, '../db/leaderboard_full.json');
    const yapsPathZero = path.join(__dirname, '../db/yaps_season_zero.json');
    const yapsPathOne = path.join(__dirname, '../db/yaps_season_one.json');
    if (!fs.existsSync(leaderboardPath)) {
        return res.status(404).json({ message: 'leaderboard_full.json dosyası bulunamadı' });
    }
    if (!fs.existsSync(yapsPathZero)) {
        return res.status(404).json({ message: 'yaps_season_zero.json dosyası bulunamadı' });
    }
    if (!fs.existsSync(yapsPathOne)) {
        return res.status(404).json({ message: 'yaps_season_one.json dosyası bulunamadı' });
    }
    try {
        const leaderboardData = JSON.parse(fs.readFileSync(leaderboardPath, 'utf8'));
        const searchName = username.trim().toLowerCase();
        const user = leaderboardData.find(u =>
            (u.display_name && u.display_name.trim().toLowerCase() === searchName) ||
            (u.username && u.username.trim().toLowerCase() === searchName)
        );
        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı leaderboard_full.json dosyasında bulunamadı' });
        }
        const total_xp = user.total_xp;
        const level = user.level;
        const title = user.title;
        const pfp = user.pfp;
        const yapsDataZero = JSON.parse(fs.readFileSync(yapsPathZero, 'utf8'));
        const yapsDataOne = JSON.parse(fs.readFileSync(yapsPathOne, 'utf8'));
        let mindshare_s0 = '0';
        let mindshare_s1 = '0';
        let matchName = user.username ? user.username : user.display_name;
        if (matchName) {
            const yapsUserZero = yapsDataZero.find(u => u.username && u.username.trim().toLowerCase() === matchName.trim().toLowerCase());
            if (yapsUserZero && yapsUserZero.mindshare !== null && yapsUserZero.mindshare !== undefined) {
                mindshare_s0 = (parseFloat(yapsUserZero.mindshare));
            }
            const yapsUserOne = yapsDataOne.find(u => u.username && u.username.trim().toLowerCase() === matchName.trim().toLowerCase());
            if (yapsUserOne && yapsUserOne.mindshare !== null && yapsUserOne.mindshare !== undefined) {
                mindshare_s1 = (parseFloat(yapsUserOne.mindshare) * 100).toFixed(2);
            }
        }
        res.json({ total_xp, level, title, pfp, mindshare_s0, mindshare_s1 });
    } catch (error) {
        res.status(500).json({ message: 'Veri okuma hatası', error: error.message });
    }
});


// Yeni endpoint: leaderboard_full.json'dan username ile user_id bulup, yaps_season_one.json'dan ilgili bilgileri döndür
router.get('/get-user-yaps-season-one/:username', async (req, res) => {
    const username = req.params.username;
    const leaderboardPath = path.join(__dirname, '../db/leaderboard_full.json');
    const yapsPath = path.join(__dirname, '../db/yaps_season_one.json');
    if (!fs.existsSync(leaderboardPath)) {
        return res.status(404).json({ message: 'leaderboard_full.json dosyası bulunamadı' });
    }
    if (!fs.existsSync(yapsPath)) {
        return res.status(404).json({ message: 'yaps_season_one.json dosyası bulunamadı' });
    }
    try {
        const leaderboardData = JSON.parse(fs.readFileSync(leaderboardPath, 'utf8'));
        const user = leaderboardData.find(u => u.display_name === username || u.username === username);
        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı leaderboard_full.json dosyasında bulunamadı' });
        }
        const userName = user.username;
        const yapsData = JSON.parse(fs.readFileSync(yapsPath, 'utf8'));
        const yapsUser = yapsData.find(u => u.username === userName);
        if (!yapsUser) {
            return res.status(404).json({ message: 'Kullanıcı yaps_season_one.json dosyasında bulunamadı' });
        }
        res.json(yapsUser);
    } catch (error) {
        res.status(500).json({ message: 'Veri okuma hatası', error: error.message });
    }
});

// leaderboard_full.json dosyasındaki verileri level'a göre ayıran endpoint
router.post('/split-leaderboard-by-level', async (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '../db/leaderboard_full.json');
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'leaderboard_full.json dosyası bulunamadı' });
    }
    try {
        const allData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const levelMap = {};
        for (const item of allData) {
            const level = item.level ?? 'unknown';
            if (!levelMap[level]) levelMap[level] = [];
            levelMap[level].push(item);
        }
        // Her level için ayrı dosya oluştur
        Object.entries(levelMap).forEach(([level, items]) => {
            const outPath = path.join(__dirname, `../db/leaderboard_level_${level}.json`);
            fs.writeFileSync(outPath, JSON.stringify(items, null, 2));
        });
        res.json({ message: 'Veriler level bazında dosyalara ayrıldı', levels: Object.keys(levelMap) });
    } catch (error) {
        res.status(500).json({ message: 'Level bazında ayırma hatası', error: error.message });
    }
});

// Route to retrieve user information based on username
router.get('/user/:username', async (req, res) => {
    const username = req.params.username;
    try {
        const userInfo = await db.getUserInfo(username);
        if (userInfo) {
            res.status(200).json(userInfo);
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving user information', error });
    }
});

// Hızlı toplu leaderboard doldurma endpointi (bellekte index ve toplu dosya yazımı)
router.post('/fill-leaderboard', async (req, res) => {
    const { apikey, authorization, limit = 1000, maxPages = 10000 } = req.body;
    let offset = 0;
    let totalInserted = 0;
    let duplicateCount = 0;
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '../db/leaderboard_full.json');
    let allData = [];
    // Mevcut dosyadaki verileri belleğe al
    if (fs.existsSync(filePath)) {
        try {
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
            allData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {}
    }
    try {
        for (let page = 0; page < maxPages; page++) {
            const apiUrl = `https://api.dashboard.union.build/rest/v1/leaderboard?select=*&offset=${offset}&limit=${limit}`;
            const response = await require('axios').get(apiUrl, {
                headers: {
                    'apikey': apikey,
                    'Authorization': authorization
                }
            });
            const items = Array.isArray(response.data) ? response.data : [];
            if (items.length === 0) break;
            allData = allData.concat(items);
            totalInserted += items.length;
            offset += limit;
        }
        fs.writeFileSync(filePath, JSON.stringify(allData, null, 2));
        res.json({ message: 'Leaderboard doldurma tamamlandı', totalInserted });
    } catch (error) {
        res.status(500).json({ message: 'Leaderboard doldurma hatası', error: error.message });
    }
});

// Yeni endpoint: yaps_season_one_with_users verilerini dosyaya kaydet
router.post('/fill-yaps-season-one', async (req, res) => {
    const { apikey, authorization } = req.body;
    const fs = require('fs');
    const path = require('path');
    const axios = require('axios');
    const filePath = path.join(__dirname, '../db/yaps_season_one.json');
    try {
        const apiUrl = 'https://api.dashboard.union.build/rest/v1/yaps_season_one_with_users?limit=20000&order=rank.asc&select=user_id,username,mindshare,twitter_id,pfp,team';
        const response = await axios.get(apiUrl, {
            headers: {
                'apikey': apikey,
                'Authorization': authorization
            }
        });
        const items = Array.isArray(response.data) ? response.data : [];
        fs.writeFileSync(filePath, JSON.stringify(items, null, 2));
        res.json({ message: 'Yaps season one verileri kaydedildi', total: items.length });
    } catch (error) {
        res.status(500).json({ message: 'Yaps season one verileri alınamadı', error: error.message });
    }
});

// Yeni endpoint: yaps_season_zero_with_users verilerini dosyaya kaydet
router.post('/fill-yaps-season-zero', async (req, res) => {
    const { apikey, authorization } = req.body;
    const fs = require('fs');
    const path = require('path');
    const axios = require('axios');
    const filePath = path.join(__dirname, '../db/yaps_season_zero.json');
    try {
        const apiUrl = 'https://api.dashboard.union.build/rest/v1/yaps_season_zero_with_users?select=user_id,username,mindshare,twitter_id,pfp,team&order=rank.asc&limit=20000';
        const response = await axios.get(apiUrl, {
            headers: {
                'apikey': apikey,
                'Authorization': authorization
            }
        });
        const items = Array.isArray(response.data) ? response.data : [];
        fs.writeFileSync(filePath, JSON.stringify(items, null, 2));
        res.json({ message: 'Yaps season zero verileri kaydedildi', total: items.length });
    } catch (error) {
        res.status(500).json({ message: 'Yaps season zero verileri alınamadı', error: error.message });
    }
});

// Yeni endpoint: leaderboard_full.json'dan username ile user_id ve pfp bilgisini döndür
router.get('/get-user-pfp-id/:username', async (req, res) => {
    const username = req.params.username;
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '../db/leaderboard_full.json');
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'leaderboard_full.json dosyası bulunamadı' });
    }
    try {
        const allData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const user = allData.find(u => u.display_name === username || u.username === username);
        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
        }
        res.json({ user_id: user.user_id, pfp: user.pfp });
    } catch (error) {
        res.status(500).json({ message: 'Veri okuma hatası', error: error.message });
    }
});

module.exports = router;


router.get('/leaderboard/:username', async (req, res) => {
    const username = req.params.username;
    try {
        // Önce dosyadan kontrol et
        const cachedLeaderboard = await db.getLeaderboardInfo(username);
        if (cachedLeaderboard) {
            // Dosyada varsa sadece ilgili kullanıcıyı döndür
            return res.status(200).json(cachedLeaderboard);
        }
        // Yoksa servisten çek
        const apiUrl = `https://api.dashboard.union.build//rest/v1/leaderboard?select=*&display_name=eq.${username}`;
        const response = await axios.get(apiUrl, {
            headers: {
                'apikey': process.env.UNION_API_KEY,
                'Authorization': `Bearer ${process.env.UNION_BEARER_TOKEN}`
            }
        });
        const leaderboard = Array.isArray(response.data) && response.data.length > 0 ? response.data[0] : null;
        if (leaderboard) {
            // Tüm bilgileri dosyaya kaydet
            await db.saveLeaderboardInfo(username, leaderboard);
            return res.status(200).json(leaderboard);
        } else {
            return res.status(404).json({ message: 'Leaderboard data not found' });
        }
    } catch (error) {
        res.status(error.response?.status || 500).json({
            message: 'Error fetching leaderboard data',
            error: error.message
        });
    }
});