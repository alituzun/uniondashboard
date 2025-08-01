

// Gerekli modüller sadece en başta tanımlanır
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Paginated leaderboard endpoint: returns users sorted by display_name, paginated
router.get('/api/leaderboard', async (req, res) => {
    const filePath = path.join(__dirname, '../db/leaderboard_full.json');
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'leaderboard_full.json dosyası bulunamadı' });
    }
    try {
        const allData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        // Sort by display_name (case-insensitive)
        allData.sort((a, b) => {
            const nameA = (a.display_name || '').toLowerCase();
            const nameB = (b.display_name || '').toLowerCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
            return 0;
        });
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 100;
        const start = (page - 1) * limit;
        const end = start + limit;
        const pagedData = allData.slice(start, end);
        res.json({
            page,
            limit,
            total: allData.length,
            totalPages: Math.ceil(allData.length / limit),
            data: pagedData
        });
    } catch (error) {
        res.status(500).json({ message: 'Leaderboard verisi okunamadı', error: error.message });
    }
});



// Yeni endpoint: leaderboard_export.csv dosyasını okuyup 1-10 level arası kişi sayılarını ve toplam XP'yi döndürür
router.get('/rank-counts-from-csv', async (req, res) => {
    const csvPath = path.join(__dirname, '../db/leaderboard_export.csv');
    if (!fs.existsSync(csvPath)) {
        return res.status(404).json({ message: 'leaderboard_export.csv dosyası bulunamadı' });
    }
    try {
        const csvData = fs.readFileSync(csvPath, 'utf8');
        const lines = csvData.split(/\r?\n/).slice(1); // başlık hariç
        const levelStats = {};
        
        // Her level için hem count hem de totalXp initialize et
        for (let lvl = 1; lvl <= 10; lvl++) {
            levelStats[lvl] = {
                count: 0,
                totalXp: 0
            };
        }
        
        for (const line of lines) {
            if (!line.trim()) continue;
            
            // CSV formatı: "rank","display_name","total_xp","level"
            const parts = line.split('","');
            if (parts.length < 4) continue;
            
            // Level'i al (son sütun, tırnakları temizle)
            const levelStr = parts[3].replace(/"/g, '');
            const level = parseInt(levelStr);
            
            // Total XP'yi al (üçüncü sütun)
            const totalXpStr = parts[2];
            const totalXp = parseInt(totalXpStr) || 0;
            
            if (level !== undefined && level !== null && !isNaN(level) && levelStats.hasOwnProperty(level)) {
                levelStats[level].count++;
                levelStats[level].totalXp += totalXp;
            }
        }
        
        res.json({ 
            message: 'Level bazında kişi sayısı ve toplam XP hesaplandı', 
            levelStats 
        });
    } catch (error) {
        res.status(500).json({ message: 'CSV okuma veya işleme hatası', error: error.message });
    }
});


// Yeni endpoint: leaderboard_full_1...71.json dosyalarını gezip rank, display_name, total_xp, level ile CSV oluştur
router.get('/export-leaderboard-csv', async (req, res) => {
    const dbDir = path.join(__dirname, '../db');
    const csvPath = path.join(dbDir, 'leaderboard_export.csv');
    const maxFiles = 71;
    const allItems = [];
    
    try {
        // Önce tüm dosyaları oku ve verileri topla
        for (let i = 1; i <= maxFiles; i++) {
            const filePath = path.join(dbDir, `leaderboard_full_${i}.json`);
            if (!fs.existsSync(filePath)) continue;
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            for (const item of data) {
                // jsonInput içindeki rank bilgisini al
                let rank = null;
                let totalXp = null;
                let level = null;
                
                // Eğer item'ın kendisinde rank varsa al, yoksa jsonInput'tan dene
                if (item.rank !== undefined && item.rank !== null) {
                    rank = item.rank;
                }
                if (item.total_xp !== undefined && item.total_xp !== null) {
                    totalXp = item.total_xp;
                }
                if (item.level !== undefined && item.level !== null) {
                    level = item.level;
                }
                
                // Eğer jsonInput string ise parse et
                let jsonInput = item;
                if (typeof item.jsonInput === 'string') {
                    try {
                        jsonInput = JSON.parse(item.jsonInput);
                        if (rank === null && jsonInput.rank !== undefined && jsonInput.rank !== null) {
                            rank = jsonInput.rank;
                        }
                        if (totalXp === null && jsonInput.total_xp !== undefined && jsonInput.total_xp !== null) {
                            totalXp = jsonInput.total_xp;
                        }
                        if (level === null && jsonInput.level !== undefined && jsonInput.level !== null) {
                            level = jsonInput.level;
                        }
                    } catch (e) {
                        // JSON parse hatası, mevcut değerleri kullan
                    }
                }
                
                const displayName = item.display_name || '';
                
                allItems.push({
                    rank: rank,
                    display_name: displayName,
                    total_xp: totalXp,
                    level: level
                });
            }
        }
        
        // Rank'a göre sırala (null değerler sona)
        allItems.sort((a, b) => {
            if (a.rank === null && b.rank === null) return 0;
            if (a.rank === null) return 1;
            if (b.rank === null) return -1;
            return parseInt(a.rank) - parseInt(b.rank);
        });
        
        // CSV başlığı
        const csvRows = [
            'rank,display_name,total_xp,level'
        ];
        
        // Her satırı CSV formatında ekle
        for (const item of allItems) {
            const rank = item.rank !== null ? item.rank : '';
            const displayName = String(item.display_name || '').replace(/"/g, '""');
            const totalXp = item.total_xp !== null ? item.total_xp : '';
            const level = item.level !== null ? item.level : '';
            
            csvRows.push(`"${rank}","${displayName}","${totalXp}","${level}"`);
        }
        
        fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');
        res.json({ 
            message: 'CSV başarıyla kaydedildi', 
            path: csvPath, 
            total: csvRows.length - 1,
            columns: ['rank', 'display_name', 'total_xp', 'level']
        });
    } catch (error) {
        res.status(500).json({ message: 'CSV oluşturma hatası', error: error.message });
    }
});


// Yeni endpoint: yaps_season_one.json'dan username ve jsonInput ile CSV oluştur
router.get('/export-yaps-season-one-csv', async (req, res) => {
    const jsonPath = path.join(__dirname, '../db/yaps_season_one.json');
    const csvPath = path.join(__dirname, '../db/yaps_season_one_export.csv');
    if (!fs.existsSync(jsonPath)) {
        return res.status(404).json({ message: 'yaps_season_one.json dosyası bulunamadı' });
    }
    try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const csvRows = [
            'username,jsonInput'
        ];
        for (const item of data) {
            const username = item.username ? String(item.username).replace(/"/g, '""') : '';
            const { username: _username, ...rest } = item;
            const jsonInput = JSON.stringify(rest).replace(/"/g, '""');
            csvRows.push(`"${username}","${jsonInput}"`);
        }
        fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');
        res.json({ message: 'CSV başarıyla kaydedildi', path: csvPath });
    } catch (error) {
        res.status(500).json({ message: 'CSV oluşturma hatası', error: error.message });
    }
});

// Yeni endpoint: yaps_season_zero.json'dan username ve jsonInput ile CSV oluştur
router.get('/export-yaps-season-zero-csv', async (req, res) => {
    const jsonPath = path.join(__dirname, '../db/yaps_season_zero.json');
    const csvPath = path.join(__dirname, '../db/yaps_season_zero_export.csv');
    if (!fs.existsSync(jsonPath)) {
        return res.status(404).json({ message: 'yaps_season_zero.json dosyası bulunamadı' });
    }
    try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const csvRows = [
            'username,jsonInput'
        ];
        for (const item of data) {
            const username = item.username ? String(item.username).replace(/"/g, '""') : '';
            const { username: _username, ...rest } = item;
            const jsonInput = JSON.stringify(rest).replace(/"/g, '""');
            csvRows.push(`"${username}","${jsonInput}"`);
        }
        fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');
        res.json({ message: 'CSV başarıyla kaydedildi', path: csvPath });
    } catch (error) {
        res.status(500).json({ message: 'CSV oluşturma hatası', error: error.message });
    }
});


// Yeni endpoint: leaderboard_export.csv dosyasını 30k kayıt olacak şekilde parçala
router.get('/split-csv-by-chunks', async (req, res) => {
    const dbDir = path.join(__dirname, '../db');
    const csvPath = path.join(dbDir, 'leaderboard_export.csv');
    const chunkSize = 30000; // 30k kayıt
    
    if (!fs.existsSync(csvPath)) {
        return res.status(404).json({ message: 'leaderboard_export.csv dosyası bulunamadı' });
    }
    
    try {
        const csvData = fs.readFileSync(csvPath, 'utf8');
        const lines = csvData.split(/\r?\n/);
        const header = lines[0]; // CSV başlığı
        const dataLines = lines.slice(1).filter(line => line.trim()); // Boş satırları çıkar
        
        const totalRecords = dataLines.length;
        const totalChunks = Math.ceil(totalRecords / chunkSize);
        const createdFiles = [];
        
        for (let i = 0; i < totalChunks; i++) {
            const startIndex = i * chunkSize;
            const endIndex = Math.min((i + 1) * chunkSize, totalRecords);
            const chunkLines = dataLines.slice(startIndex, endIndex);
            
            // Chunk dosyası oluştur
            const chunkFileName = `leaderboard_export_chunk_${i + 1}.csv`;
            const chunkPath = path.join(dbDir, chunkFileName);
            
            // Header + chunk verileri
            const chunkContent = [header, ...chunkLines].join('\n');
            fs.writeFileSync(chunkPath, chunkContent, 'utf8');
            
            createdFiles.push({
                fileName: chunkFileName,
                path: chunkPath,
                recordCount: chunkLines.length,
                startRecord: startIndex + 1,
                endRecord: endIndex
            });
        }
        
        res.json({
            message: 'CSV dosyası başarıyla parçalandı',
            originalFile: csvPath,
            totalRecords: totalRecords,
            chunkSize: chunkSize,
            totalChunks: totalChunks,
            createdFiles: createdFiles
        });
    } catch (error) {
        res.status(500).json({ message: 'CSV parçalama hatası', error: error.message });
    }
});


// Yeni endpoint: Her leveldeki toplam kişi sayısını döndür
router.get('/level-counts', async (req, res) => {
    try {
        const result = {};
        let total = 0;
        for (let lvl = 1; lvl <= 10; lvl++) {
            const filePath = path.join(__dirname, '../db/leaderboard_level_' + lvl + '.json');
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const count = Array.isArray(data) ? data.length : 0;
                result['level_' + lvl] = count;
                total += count;
            } else {
                result['level_' + lvl] = 0;
            }
        }
        result['total'] = total;
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: 'Error reading level files', error: error.message });
    }
});

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
        const searchName = username.trim().toLowerCase();
        // 1. Tam eşleşme (case-insensitive)
        let user = leaderboardData.find(u =>
            (u.display_name && u.display_name.trim().toLowerCase() === searchName) ||
            (u.username && u.username.trim().toLowerCase() === searchName)
        );
        // 2. Kısmi eşleşme (case-insensitive, ilike mantığı)
        if (!user) {
            user = leaderboardData.find(u =>
                (u.display_name && u.display_name.trim().toLowerCase().includes(searchName)) ||
                (u.username && u.username.trim().toLowerCase().includes(searchName))
            );
        }
        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı leaderboard_full.json dosyasında bulunamadı' });
        }
        const userName = user.username;
        const yapsData = JSON.parse(fs.readFileSync(yapsPath, 'utf8'));
        // 1. Tam eşleşme (case-insensitive)
        let yapsUser = yapsData.find(u => u.username && u.username.trim().toLowerCase() === userName.trim().toLowerCase());
        // 2. Kısmi eşleşme (case-insensitive)
        if (!yapsUser) {
            yapsUser = yapsData.find(u => u.username && u.username.trim().toLowerCase().includes(userName.trim().toLowerCase()));
        }
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
            res.status(404).json({ message: 'User not found. No user matches the given display_name or username (exact or partial match).' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving user information', error });
    }
});

// Hızlı toplu leaderboard doldurma endpointi (her istek ayrı dosyaya)
router.post('/fill-leaderboard', async (req, res) => {
    const { apikey, authorization } = req.body;
    const fs = require('fs');
    const path = require('path');
    const axios = require('axios');
    const batchSize = 5000;
    const maxRank = 370000;
    const dbDir = path.join(__dirname, '../db');
    let totalInserted = 0;
    let fileCount = 0;

    try {
        for (let start = 1; start <= maxRank; start += batchSize) {
            const end = Math.min(start + batchSize, maxRank + 1);
            const apiUrl = `https://api.dashboard.union.build/rest/v1/leaderboard?rank=gte.${start}&rank=lt.${end}`;
            const response = await axios.get(apiUrl, {
                headers: {
                    'apikey': apikey,
                    'Authorization': authorization
                }
            });
            const items = Array.isArray(response.data) ? response.data : [];
            if (items.length === 0) break;
            fileCount++;
            const filePath = path.join(dbDir, `leaderboard_full_${fileCount}.json`);
            fs.writeFileSync(filePath, JSON.stringify(items, null, 2));
            totalInserted += items.length;
        }
        res.json({ message: 'Leaderboard fill completed', totalInserted, fileCount });
    } catch (error) {
        res.status(500).json({ message: 'Leaderboard fill error', error: error.message });
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

// Yeni endpoint: Tüm leaderboard_full_i.json dosyalarını birleştirip tek bir dosyaya kaydet
router.get('/merge-leaderboard-files', async (req, res) => {
    const dbDir = path.join(__dirname, '../db');
    const mergedPath = path.join(dbDir, 'leaderboard_full_merged.json');
    const maxFiles = 100;
    let totalCount = 0;
    try {
        const writeStream = fs.createWriteStream(mergedPath, { encoding: 'utf8' });
        writeStream.write('[');
        let first = true;
        for (let i = 1; i <= maxFiles; i++) {
            const filePath = path.join(dbDir, `leaderboard_full_${i}.json`);
            if (!fs.existsSync(filePath)) continue;
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (Array.isArray(data)) {
                for (const item of data) {
                    if (!first) writeStream.write(',\n');
                    writeStream.write(JSON.stringify(item));
                    first = false;
                    totalCount++;
                }
            }
        }
        writeStream.write(']');
        writeStream.end();
        writeStream.on('finish', () => {
            res.json({ message: 'Tüm leaderboard_full_i.json dosyaları birleştirildi (stream)', path: mergedPath, total: totalCount });
        });
        writeStream.on('error', (err) => {
            res.status(500).json({ message: 'Birleştirme hatası (stream)', error: err.message });
        });
    } catch (error) {
        res.status(500).json({ message: 'Birleştirme hatası', error: error.message });
    }
});


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