

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
        
        let processedCount = 0;
        let errorCount = 0;
        
        for (const line of lines) {
            if (!line.trim()) continue;
            
            try {
                // CSV formatı: "display_name","jsonInput"
                // jsonInput içinde level ve total_xp bilgileri var
                
                let parts;
                if (line.includes('","')) {
                    // Quoted format: "display_name","jsonInput"
                    parts = line.split('","');
                    // İlk ve son elemanlardan tırnakları temizle
                    if (parts.length >= 2) {
                        parts[0] = parts[0].replace(/^"/, '');
                        parts[1] = parts[1].replace(/"$/, '');
                    }
                } else {
                    // Unquoted format: display_name,jsonInput
                    const commaIndex = line.indexOf(',');
                    if (commaIndex !== -1) {
                        parts = [
                            line.substring(0, commaIndex),
                            line.substring(commaIndex + 1)
                        ];
                    } else {
                        parts = line.split(',');
                    }
                }
                
                if (parts.length < 2) {
                    errorCount++;
                    continue;
                }
                
                // jsonInput'u parse et
                const jsonInputStr = parts[1].trim();
                let jsonData;
                
                try {
                    // Escaped quotes'ları düzelt
                    const cleanJsonStr = jsonInputStr.replace(/""/g, '"');
                    jsonData = JSON.parse(cleanJsonStr);
                } catch (jsonError) {
                    // JSON parse hatası
                    errorCount++;
                    continue;
                }
                
                // Level ve total_xp bilgilerini al
                const level = parseInt(jsonData.level);
                const totalXp = parseInt(jsonData.total_xp) || 0;
                
                if (level >= 1 && level <= 10 && !isNaN(level)) {
                    levelStats[level].count++;
                    levelStats[level].totalXp += totalXp;
                    processedCount++;
                }
                
            } catch (parseError) {
                errorCount++;
                if (errorCount <= 5) { // İlk 5 hatayı logla
                    console.log('Parse error for line:', line.substring(0, 200), parseError.message);
                }
            }
        }
        
        res.json({ 
            message: 'Level bazında kişi sayısı ve toplam XP hesaplandı', 
            levelStats,
            processedCount,
            errorCount,
            totalLines: lines.length
        });
    } catch (error) {
        res.status(500).json({ message: 'CSV okuma veya işleme hatası', error: error.message });
    }
});

// Yeni endpoint: leaderboard_export.csv dosyasını jsonInput'taki level'lara göre ayrı CSV dosyalarına böl
router.get('/split-csv-to-json-by-levels', async (req, res) => {
    const dbDir = path.join(__dirname, '../db');
    const csvPath = path.join(dbDir, 'leaderboard_export.csv');
    
    if (!fs.existsSync(csvPath)) {
        return res.status(404).json({ message: 'leaderboard_export.csv dosyası bulunamadı' });
    }
    
    try {
        const csvData = fs.readFileSync(csvPath, 'utf8');
        const lines = csvData.split(/\r?\n/);
        const header = lines[0]; // CSV başlığı: display_name,jsonInput
        const dataLines = lines.slice(1).filter(line => line.trim());
        
        // Level'lara göre data ayır
        const levelData = {};
        for (let lvl = 1; lvl <= 10; lvl++) {
            levelData[lvl] = [];
        }
        
        let processedCount = 0;
        let errorCount = 0;
        let debugCount = 0;
        
        for (const line of dataLines) {
            debugCount++;
            
            try {
                // CSV parsing - robust parsing
                let displayName = '';
                let jsonInputStr = '';
                
                // Manuel parsing çünkü JSON içinde virgül var
                if (line.startsWith('"')) {
                    // "display_name","jsonInput" formatı
                    const firstQuoteEnd = line.indexOf('","');
                    if (firstQuoteEnd !== -1) {
                        displayName = line.substring(1, firstQuoteEnd); // İlk " dan sonrası
                        jsonInputStr = line.substring(firstQuoteEnd + 3); // "," dan sonrası
                        // Son " 'ı kaldır
                        if (jsonInputStr.endsWith('"')) {
                            jsonInputStr = jsonInputStr.slice(0, -1);
                        }
                    } else {
                        errorCount++;
                        continue;
                    }
                } else {
                    // Basit format deneme
                    const commaIndex = line.indexOf(',');
                    if (commaIndex !== -1) {
                        displayName = line.substring(0, commaIndex);
                        jsonInputStr = line.substring(commaIndex + 1);
                    } else {
                        errorCount++;
                        continue;
                    }
                }
                
                // jsonInput'u parse et
                try {
                    // Escaped quotes'ları düzelt
                    const cleanJsonStr = jsonInputStr.replace(/""/g, '"');
                    const jsonData = JSON.parse(cleanJsonStr);
                    
                    const level = parseInt(jsonData.level);
                    
                    if (level >= 1 && level <= 10 && !isNaN(level)) {
                        // Orijinal CSV satırını koruyarak ekle
                        levelData[level].push(line);
                        processedCount++;
                    } else {
                        errorCount++;
                    }
                    
                } catch (jsonError) {
                    errorCount++;
                }
                
            } catch (parseError) {
                errorCount++;
            }
        }
        
        // Her level için ayrı CSV dosyası oluştur (CSV formatını koruyarak)
        const createdFiles = [];
        for (let lvl = 1; lvl <= 10; lvl++) {
            if (levelData[lvl].length > 0) {
                const levelFileName = `leaderboard_level_${lvl}_from_csv.csv`;
                const levelPath = path.join(dbDir, levelFileName);
                
                // Header + level verileri (CSV formatında)
                const levelContent = [header, ...levelData[lvl]].join('\n');
                fs.writeFileSync(levelPath, levelContent, 'utf8');
                
                createdFiles.push({
                    level: lvl,
                    fileName: levelFileName,
                    path: levelPath,
                    recordCount: levelData[lvl].length
                });
                
                console.log(`Created level ${lvl} CSV file with ${levelData[lvl].length} records`);
            }
        }
        
        res.json({
            message: 'CSV dosyası level bazında CSV dosyalarına başarıyla bölündü',
            originalFile: csvPath,
            processedCount: processedCount,
            errorCount: errorCount,
            totalLines: dataLines.length,
            levelBreakdown: Object.keys(levelData).reduce((acc, level) => {
                acc[`level_${level}`] = levelData[level].length;
                return acc;
            }, {}),
            createdFiles: createdFiles
        });
        
    } catch (error) {
        console.error('Split CSV by levels error:', error);
        res.status(500).json({ message: 'CSV level bazında bölme hatası', error: error.message });
    }
});

// Yeni endpoint: leaderboard_export.csv dosyasını level'lara göre ayrı CSV dosyalarına böl
router.get('/split-csv-by-levels', async (req, res) => {
    const dbDir = path.join(__dirname, '../db');
    const csvPath = path.join(dbDir, 'leaderboard_export.csv');
    
    if (!fs.existsSync(csvPath)) {
        return res.status(404).json({ message: 'leaderboard_export.csv dosyası bulunamadı' });
    }
    
    try {
        const csvData = fs.readFileSync(csvPath, 'utf8');
        const lines = csvData.split(/\r?\n/);
        const header = lines[0]; // CSV başlığı: display_name,jsonInput
        const dataLines = lines.slice(1).filter(line => line.trim());
        
        // Level'lara göre data ayır
        const levelData = {};
        for (let lvl = 1; lvl <= 10; lvl++) {
            levelData[lvl] = [];
        }
        
        let processedCount = 0;
        let errorCount = 0;
        let debugCount = 0;
        
        for (const line of dataLines) {
            debugCount++;
            if (debugCount <= 5) {
                console.log(`Processing line ${debugCount}:`, line.substring(0, 100));
            }
            
            try {
                // CSV parsing - daha güvenilir parsing
                let displayName = '';
                let jsonInputStr = '';
                
                // Manuel parsing çünkü JSON içinde virgül var
                if (line.startsWith('"')) {
                    // "display_name","jsonInput" formatı
                    const firstQuoteEnd = line.indexOf('","');
                    if (firstQuoteEnd !== -1) {
                        displayName = line.substring(1, firstQuoteEnd); // İlk " dan sonrası
                        jsonInputStr = line.substring(firstQuoteEnd + 3); // "," dan sonrası
                        // Son " 'ı kaldır
                        if (jsonInputStr.endsWith('"')) {
                            jsonInputStr = jsonInputStr.slice(0, -1);
                        }
                    } else {
                        errorCount++;
                        continue;
                    }
                } else {
                    // Basit format deneme
                    const commaIndex = line.indexOf(',');
                    if (commaIndex !== -1) {
                        displayName = line.substring(0, commaIndex);
                        jsonInputStr = line.substring(commaIndex + 1);
                    } else {
                        errorCount++;
                        continue;
                    }
                }
                
                // jsonInput'u parse et
                try {
                    // Escaped quotes'ları düzelt
                    const cleanJsonStr = jsonInputStr.replace(/""/g, '"');
                    const jsonData = JSON.parse(cleanJsonStr);
                    
                    const level = parseInt(jsonData.level);
                    
                    if (debugCount <= 5) {
                        console.log(`Line ${debugCount} - Level: ${level}, Display Name: ${displayName.substring(0, 20)}`);
                    }
                    
                    if (level >= 1 && level <= 10 && !isNaN(level)) {
                        levelData[level].push(line);
                        processedCount++;
                    } else {
                        if (debugCount <= 10) {
                            console.log(`Invalid level ${level} for line ${debugCount}`);
                        }
                        errorCount++;
                    }
                    
                } catch (jsonError) {
                    if (debugCount <= 10) {
                        console.log(`JSON parse error for line ${debugCount}:`, jsonError.message);
                        console.log(`JSON string:`, jsonInputStr.substring(0, 100));
                    }
                    errorCount++;
                }
                
            } catch (parseError) {
                if (debugCount <= 10) {
                    console.log(`Parse error for line ${debugCount}:`, parseError.message);
                }
                errorCount++;
            }
        }
        
        // Her level için ayrı CSV dosyası oluştur
        const createdFiles = [];
        for (let lvl = 1; lvl <= 10; lvl++) {
            if (levelData[lvl].length > 0) {
                const levelFileName = `leaderboard_level_${lvl}.csv`;
                const levelPath = path.join(dbDir, levelFileName);
                
                // Header + level verileri
                const levelContent = [header, ...levelData[lvl]].join('\n');
                fs.writeFileSync(levelPath, levelContent, 'utf8');
                
                createdFiles.push({
                    level: lvl,
                    fileName: levelFileName,
                    path: levelPath,
                    recordCount: levelData[lvl].length
                });
                
                console.log(`Created level ${lvl} file with ${levelData[lvl].length} records`);
            }
        }
        
        res.json({
            message: 'CSV dosyası level bazında başarıyla bölündü',
            originalFile: csvPath,
            processedCount: processedCount,
            errorCount: errorCount,
            totalLines: dataLines.length,
            levelBreakdown: Object.keys(levelData).reduce((acc, level) => {
                acc[`level_${level}`] = levelData[level].length;
                return acc;
            }, {}),
            createdFiles: createdFiles
        });
        
    } catch (error) {
        console.error('Split CSV error:', error);
        res.status(500).json({ message: 'CSV level bazında bölme hatası', error: error.message });
    }
});

// Yeni endpoint: Level bazında oluşturulan CSV dosyalarından istatistikleri hesapla
router.get('/calculate-level-stats-from-files', async (req, res) => {
    const dbDir = path.join(__dirname, '../db');
    const levelStats = {};
    let totalProcessed = 0;
    let totalErrors = 0;
    
    try {
        // Her level için CSV dosyasını kontrol et ve istatistikleri hesapla
        for (let lvl = 1; lvl <= 10; lvl++) {
            const levelFileName = `leaderboard_level_${lvl}_from_csv.csv`;
            const levelPath = path.join(dbDir, levelFileName);
            
            levelStats[lvl] = {
                count: 0,
                totalXp: 0,
                averageXp: 0,
                fileExists: false
            };
            
            if (fs.existsSync(levelPath)) {
                levelStats[lvl].fileExists = true;
                
                try {
                    const csvData = fs.readFileSync(levelPath, 'utf8');
                    const lines = csvData.split(/\r?\n/).slice(1).filter(line => line.trim());
                    
                    let levelTotalXp = 0;
                    let levelCount = 0;
                    let levelErrors = 0;
                    
                    for (const line of lines) {
                        try {
                            // CSV parsing - same robust logic as split-csv-by-levels
                            let displayName = '';
                            let jsonInputStr = '';
                            
                            // Manuel parsing çünkü JSON içinde virgül var
                            if (line.startsWith('"')) {
                                // "display_name","jsonInput" formatı
                                const firstQuoteEnd = line.indexOf('","');
                                if (firstQuoteEnd !== -1) {
                                    displayName = line.substring(1, firstQuoteEnd); // İlk " dan sonrası
                                    jsonInputStr = line.substring(firstQuoteEnd + 3); // "," dan sonrası
                                    // Son " 'ı kaldır
                                    if (jsonInputStr.endsWith('"')) {
                                        jsonInputStr = jsonInputStr.slice(0, -1);
                                    }
                                } else {
                                    levelErrors++;
                                    continue;
                                }
                            } else {
                                // Basit format deneme
                                const commaIndex = line.indexOf(',');
                                if (commaIndex !== -1) {
                                    displayName = line.substring(0, commaIndex);
                                    jsonInputStr = line.substring(commaIndex + 1);
                                } else {
                                    levelErrors++;
                                    continue;
                                }
                            }
                            
                            // jsonInput'u parse et
                            try {
                                // Escaped quotes'ları düzelt
                                const cleanJsonStr = jsonInputStr.replace(/""/g, '"');
                                const jsonData = JSON.parse(cleanJsonStr);
                                
                                const totalXp = parseInt(jsonData.total_xp) || 0;
                                
                                levelTotalXp += totalXp;
                                levelCount++;
                                
                            } catch (jsonError) {
                                levelErrors++;
                            }
                            
                        } catch (parseError) {
                            levelErrors++;
                        }
                    }
                    
                    levelStats[lvl].count = levelCount;
                    levelStats[lvl].totalXp = levelTotalXp;
                    levelStats[lvl].averageXp = levelCount > 0 ? Math.round(levelTotalXp / levelCount) : 0;
                    
                    totalProcessed += levelCount;
                    totalErrors += levelErrors;
                    
                } catch (fileError) {
                    console.log(`Error reading level ${lvl} file:`, fileError.message);
                }
            }
        }
        
        // Genel istatistikler
        const totalUsers = Object.values(levelStats).reduce((sum, level) => sum + level.count, 0);
        const totalXpAll = Object.values(levelStats).reduce((sum, level) => sum + level.totalXp, 0);
        
        res.json({
            message: 'Level bazında istatistikler hesaplandı',
            levelStats: levelStats,
            summary: {
                totalUsers: totalUsers,
                totalXp: totalXpAll,
                averageXpOverall: totalUsers > 0 ? Math.round(totalXpAll / totalUsers) : 0,
                processedRecords: totalProcessed,
                errorCount: totalErrors
            }
        });
        
    } catch (error) {
        res.status(500).json({ message: 'Level istatistikleri hesaplama hatası', error: error.message });
    }
});


// Yeni endpoint: leaderboard_full_1...71.json dosyalarını gezip rank, display_name, total_xp, level ile CSV oluştur
// Eğer ?format=json parametresi varsa display_name ve jsonInput formatında CSV oluştur
router.get('/export-leaderboard-csv', async (req, res) => {
    const dbDir = path.join(__dirname, '../db');
    const csvPath = path.join(dbDir, 'leaderboard_export.csv');
    const maxFiles = 71;
    const allItems = [];
    const useJsonFormat = req.query.format === 'json'; // Yeni parametre kontrolü
    
    try {
        // Önce tüm dosyaları oku ve verileri topla
        for (let i = 1; i <= maxFiles; i++) {
            const filePath = path.join(dbDir, `leaderboard_full_${i}.json`);
            if (!fs.existsSync(filePath)) continue;
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            for (const item of data) {
                if (useJsonFormat) {
                    // JSON format: display_name ve jsonInput
                    const displayName = item.display_name || '';
                    const { display_name, ...restOfItem } = item; // display_name hariç tüm alanlar
                    
                    allItems.push({
                        display_name: displayName,
                        jsonInput: restOfItem
                    });
                } else {
                    // Orijinal format: rank, display_name, total_xp, level (eski akış)
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
        }
        
        if (useJsonFormat) {
            // JSON format için CSV oluştur (yeni format)
            const csvRows = [
                'display_name,jsonInput'
            ];
            
            for (const item of allItems) {
                const displayName = String(item.display_name || '').replace(/"/g, '""');
                const jsonInput = JSON.stringify(item.jsonInput).replace(/"/g, '""');
                
                csvRows.push(`"${displayName}","${jsonInput}"`);
            }
            
            fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');
            res.json({ 
                message: 'CSV başarıyla kaydedildi (JSON format)', 
                path: csvPath, 
                total: csvRows.length - 1,
                format: 'display_name,jsonInput',
                columns: ['display_name', 'jsonInput']
            });
        } else {
            // Orijinal format için rank'a göre sırala ve CSV oluştur (eski akış)
            allItems.sort((a, b) => {
                if (a.rank === null && b.rank === null) return 0;
                if (a.rank === null) return 1;
                if (b.rank === null) return -1;
                return parseInt(a.rank) - parseInt(b.rank);
            });
            
            const csvRows = [
                'rank,display_name,total_xp,level'
            ];
            
            for (const item of allItems) {
                const rank = item.rank !== null ? item.rank : '';
                const displayName = String(item.display_name || '').replace(/"/g, '""');
                const totalXp = item.total_xp !== null ? item.total_xp : '';
                const level = item.level !== null ? item.level : '';
                
                csvRows.push(`"${rank}","${displayName}","${totalXp}","${level}"`);
            }
            
            fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');
            res.json({ 
                message: 'CSV başarıyla kaydedildi (standart format)', 
                path: csvPath, 
                total: csvRows.length - 1,
                format: 'rank,display_name,total_xp,level',
                columns: ['rank', 'display_name', 'total_xp', 'level']
            });
        }
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

// Yeni endpoint: leaderboard_export.csv dosyasını 5 eşit parçaya böl
router.get('/split-csv-into-10-parts', async (req, res) => {
    const dbDir = path.join(__dirname, '../db');
    const csvPath = path.join(dbDir, 'leaderboard_export.csv');
    const totalParts = 5; // 5 eşit parça
    
    if (!fs.existsSync(csvPath)) {
        return res.status(404).json({ message: 'leaderboard_export.csv dosyası bulunamadı' });
    }
    
    try {
        const csvData = fs.readFileSync(csvPath, 'utf8');
        const lines = csvData.split(/\r?\n/);
        const header = lines[0]; // CSV başlığı
        const dataLines = lines.slice(1).filter(line => line.trim()); // Boş satırları çıkar
        
        const totalRecords = dataLines.length;
        const recordsPerPart = Math.ceil(totalRecords / totalParts);
        const createdFiles = [];
        
        for (let i = 0; i < totalParts; i++) {
            const startIndex = i * recordsPerPart;
            const endIndex = Math.min((i + 1) * recordsPerPart, totalRecords);
            
            // Bu parçada veri yoksa döngüyü sonlandır
            if (startIndex >= totalRecords) break;
            
            const chunkLines = dataLines.slice(startIndex, endIndex);
            
            // Part dosyası oluştur
            const partFileName = `leaderboard_export_part_${i + 1}.csv`;
            const partPath = path.join(dbDir, partFileName);
            
            // Header + part verileri
            const partContent = [header, ...chunkLines].join('\n');
            fs.writeFileSync(partPath, partContent, 'utf8');
            
            createdFiles.push({
                fileName: partFileName,
                path: partPath,
                recordCount: chunkLines.length,
                startRecord: startIndex + 1,
                endRecord: endIndex > totalRecords ? totalRecords : endIndex,
                partNumber: i + 1
            });
        }
        
        res.json({
            message: 'CSV dosyası 5 eşit parçaya başarıyla bölündü',
            originalFile: csvPath,
            totalRecords: totalRecords,
            recordsPerPart: recordsPerPart,
            totalParts: createdFiles.length,
            createdFiles: createdFiles
        });
    } catch (error) {
        res.status(500).json({ message: 'CSV bölme hatası', error: error.message });
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

// Yeni endpoint: rewards_level_*.csv dosyalarından Supabase'e veri insert et
router.post('/import-rewards-to-supabase', async (req, res) => {
    const dbDir = path.join(__dirname, '../db');
    const axios = require('axios');
    
    // Supabase credentials - embedded
    const supabaseUrl = 'https://bvvlqbtwqetltdcvioie.supabase.co';
    const apikey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dmxxYnR3cWV0bHRkY3Zpb2llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwMjM4MzMsImV4cCI6MjA2OTU5OTgzM30.d-leDFpzc6uxDvq47_FC0Fqh0ztaL11Oozm-z6T9N_M';
    const authorization = `Bearer ${apikey}`;
    
    let totalInserted = 0;
    let totalErrors = 0;
    let processedFiles = [];
    
    try {
        console.log('🚀 Starting rewards import to Supabase...');
        
        // Her level için CSV dosyasını kontrol et ve işle
        for (let level = 1; level <= 10; level++) {
            const rewardsCsvPath = path.join(dbDir, `rewards_level_${level}.csv`);
            
            if (!fs.existsSync(rewardsCsvPath)) {
                console.log(`⚠️ Level ${level} rewards file not found: rewards_level_${level}.csv`);
                continue;
            }
            
            console.log(`📂 Processing level ${level} rewards...`);
            
            try {
                const csvData = fs.readFileSync(rewardsCsvPath, 'utf8');
                const lines = csvData.split(/\r?\n/).filter(line => line.trim());
                const dataLines = lines.slice(1); // Skip header
                
                if (dataLines.length === 0) {
                    console.log(`✅ Level ${level}: No data to process`);
                    continue;
                }
                
                console.log(`📊 Level ${level}: ${dataLines.length} rewards to insert`);
                
                let levelInserted = 0;
                let levelErrors = 0;
                const batchSize = 100; // Supabase batch insert size
                
                // Process in batches
                for (let i = 0; i < dataLines.length; i += batchSize) {
                    const batch = dataLines.slice(i, i + batchSize);
                    const batchNumber = Math.floor(i/batchSize) + 1;
                    const totalBatches = Math.ceil(dataLines.length/batchSize);
                    
                    console.log(`🔄 Level ${level} - Batch ${batchNumber}/${totalBatches} (${batch.length} records)`);
                    
                    const batchData = [];
                    
                    for (const line of batch) {
                        try {
                            // Parse CSV line: level,user_id,display_name,reward_id,reward_title,reward_description,reward_type,xp_bonus,created_at
                            const parts = line.split(',');
                            if (parts.length >= 9) {
                                // Clean and parse fields
                                const level = parseInt(parts[0].replace(/"/g, ''));
                                const user_id = parts[1].replace(/"/g, '');
                                const display_name = parts[2].replace(/"/g, '');
                                const reward_id = parseInt(parts[3].replace(/"/g, ''));
                                const reward_title = parts[4].replace(/"/g, '');
                                const reward_description = parts[5].replace(/"/g, '');
                                const reward_type = parts[6].replace(/"/g, '') || null;
                                const xp_bonus = parts[7].replace(/"/g, '') ? parseInt(parts[7].replace(/"/g, '')) : null;
                                const created_at = parts[8].replace(/"/g, '');
                                
                                batchData.push({
                                    level: level,
                                    user_id: user_id,
                                    display_name: display_name,
                                    reward_id: reward_id,
                                    reward_title: reward_title,
                                    reward_description: reward_description,
                                    reward_type: reward_type,
                                    xp_bonus: xp_bonus,
                                    created_at: created_at
                                });
                            }
                        } catch (parseError) {
                            console.log(`❌ Parse error in level ${level}:`, parseError.message);
                            levelErrors++;
                        }
                    }
                    
                    // Insert batch to Supabase
                    if (batchData.length > 0) {
                        try {
                            const insertUrl = `${supabaseUrl}/rest/v1/rewards`;
                            const response = await axios.post(insertUrl, batchData, {
                                headers: {
                                    'apikey': apikey,
                                    'Authorization': authorization,
                                    'Content-Type': 'application/json',
                                    'Prefer': 'return=minimal'
                                }
                            });
                            
                            levelInserted += batchData.length;
                            console.log(`✅ Level ${level} - Batch ${batchNumber}: ${batchData.length} records inserted`);
                            
                        } catch (insertError) {
                            console.log(`❌ Insert error in level ${level} batch ${batchNumber}:`, insertError.message);
                            levelErrors += batchData.length;
                            
                            // Log detailed error for debugging
                            if (insertError.response) {
                                console.log(`   Status: ${insertError.response.status}`);
                                console.log(`   Error: ${JSON.stringify(insertError.response.data)}`);
                            }
                        }
                    }
                    
                    // Small delay between batches to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                totalInserted += levelInserted;
                totalErrors += levelErrors;
                
                processedFiles.push({
                    level: level,
                    fileName: `rewards_level_${level}.csv`,
                    totalRecords: dataLines.length,
                    inserted: levelInserted,
                    errors: levelErrors,
                    status: levelErrors > 0 ? 'completed with errors' : 'completed successfully'
                });
                
                console.log(`✅ Level ${level} completed: ${levelInserted} inserted, ${levelErrors} errors`);
                
            } catch (fileError) {
                console.log(`❌ Error processing level ${level}:`, fileError.message);
                totalErrors++;
                
                processedFiles.push({
                    level: level,
                    fileName: `rewards_level_${level}.csv`,
                    status: 'failed',
                    error: fileError.message
                });
            }
        }
        
        console.log(`🎉 Import completed! Total inserted: ${totalInserted}, Total errors: ${totalErrors}`);
        
        res.json({
            message: 'Rewards import to Supabase completed',
            summary: {
                totalInserted: totalInserted,
                totalErrors: totalErrors,
                processedFiles: processedFiles.length,
                status: totalErrors > 0 ? 'completed with errors' : 'completed successfully'
            },
            processedFiles: processedFiles
        });
        
    } catch (error) {
        console.error('❌ Import error:', error);
        res.status(500).json({ 
            message: 'Rewards import to Supabase failed', 
            error: error.message,
            totalInserted: totalInserted,
            totalErrors: totalErrors,
            processedFiles: processedFiles
        });
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

// Yeni endpoint: Level dosyalarından achievements çekip level bazında CSV'ye kaydet (SAFE VERSION)
router.get('/export-achievements-by-levels', async (req, res) => {
    const dbDir = path.join(__dirname, '../db');
    
    try {
        // Query parameters for optimization
        const testLevel = req.query.level ? parseInt(req.query.level) : null; // Sadece belirli bir level
        const batchSize = req.query.batch ? parseInt(req.query.batch) : 5; // Batch size (default: 5)
        const skipDelay = req.query.fast === 'true'; // Delay'i atla
        
        // Achievements API credentials (GÜNCEL TOKEN)
        const achievementsApiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcnF6cHVyeXJnZm5lY2FkYWpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQzNzM0NDAsImV4cCI6MjA0OTk0OTQ0MH0.4xkWpfMkYgBz4nqUGkZVjQNP7NxLa4filDoJRCI3yWo';
        const authToken = 'eyJhbGciOiJIUzI1NiIsImtpZCI6IndaRTlJNnZYc1RqMXlaVVAiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3VvcnF6cHVyeXJnZm5lY2FkYWpvLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI4NDMxZjljZC1iMTNjLTRhZGUtODJiYi0zMGUxMGU0NTNlMzciLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzU0MzIwNjAyLCJpYXQiOjE3NTQzMTcwMDIsImVtYWlsIjoiYWxpLnR1enVuMTFAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJkaXNjb3JkIiwicHJvdmlkZXJzIjpbImRpc2NvcmQiLCJnaXRodWIiLCJ0d2l0dGVyIl19LCJ1c2VyX21ldGFkYXRhIjp7ImF2YXRhcl91cmwiOiJodHRwczovL3Bicy50d2ltZy5jb20vcHJvZmlsZV9pbWFnZXMvMTk0NzI0MDg0NjQ2Nzc2NDIyNC9JQmVncS04UF9ub3JtYWwuanBnIiwiY3VzdG9tX2NsYWltcyI6eyJnbG9iYWxfbmFtZSI6Ikh6TWVsa29yIn0sImVtYWlsIjoiYWxpLnR1enVuMTFAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZ1bGxfbmFtZSI6Ik1lbGtvci51bmlvbiIsImlzcyI6Imh0dHBzOi8vYXBpLnR3aXR0ZXIuY29tLzEuMS9hY2NvdW50L3ZlcmlmeV9jcmVkZW50aWFscy5qc29uIiwibmFtZSI6Ik1lbGtvci51bmlvbiIsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwicGljdHVyZSI6Imh0dHBzOi8vcGJzLnR3aW1nLmNvbS9wcm9maWxlX2ltYWdlcy8xOTQ3MjQwODQ2NDY3NzY0MjI0L0lCZWdxLThQX25vcm1hbC5qcGciLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJyaWNobmZ0Y3J5cHRvIiwicHJvdmlkZXJfaWQiOiIxMzQ5MzEwOTA2NDM4NjYwMDk4Iiwic3ViIjoiMTM0OTMxMDkwNjQzODY2MDA5OCIsInVzZXJfbmFtZSI6InJpY2huZnRjcnlwdG8ifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJvYXV0aCIsInRpbWVzdGFtcCI6MTc1Mjg0NjEzMn1dLCJzZXNzaW9uX2lkIjoiYjYxYTFhYTEtMTZiNC00NzI2LTlhZTUtZWJmMjIyMjZlMTE4IiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.BTVHT49--UjZJjQFbFce-EoAXaRgbGEp67cXA9kSq2I';

        
        // Reward definitions mapping
        const rewardDefinitions = {
            1: { title: "Goblin role", description: "Received the Goblin role in the Union Discord.", type: 1 },
            2: { title: "Whaleshark Whitelist Stage 1", description: "Whitelisted for the whaleshark NFT.", type: null },
            3: { title: "Sloth role", description: "Received the LUnion role in the Union Discord.", type: 1 },
            4: { title: "Bad Kids role", description: "Received the Bad Kids role in the Union Discord.", type: 1 },
            5: { title: "V-On-Vana role", description: "Received the V-Union role in the Union Discord.", type: 1 },
            6: { title: "OG", description: "Received the OG role in the Union Discord.", type: 1 },
            7: { title: "Fanatic", description: "Received the fanatic role in the Union Discord.", type: 1 },
            9: { title: "Whaleshark Whitelist Stage 2", description: "Whitelisted for the whaleshark NFT stage 2. Make sure to add a Cosmos wallet address to remain eligble.", type: null },
            11: { title: "Whale Shark role", description: "Received the Whale Shark role in the Union Discord.", type: 1 },
            12: { title: "Mammoth Role", description: "Received the Mammoth Role in the Union Discord.", type: 1 },
            13: { title: "Conscript Role", description: "Received the Conscript Role in the Union Discord.", type: 1 },
            14: { title: "Private First Class Role", description: "Received the Private First Class Role in the Union Discord.", type: 1 },
            15: { title: "Junior Sergeant Role", description: "Received the Junior Sergeant Role in the Union Discord.", type: 1 },
            16: { title: "Sergeant Role", description: "Received the Sergeant Role in the Union Discord.", type: 1 },
            17: { title: "Senior Sergeant Role", description: "Received the Senior Sergeant Role in the Union Discord.", type: 1 },
            18: { title: "Starshina Role", description: "Received the Starshina Role in the Union Discord.", type: 1 },
            19: { title: "Junior Lieutenant Role", description: "Received the Junior Lieutenant Role in the Union Discord.", type: 1 },
            20: { title: "Lieutenant Role", description: "Received the Lieutenant Role in the Union Discord.", type: 1 },
            21: { title: "Senior Lieutenant Role", description: "Received the Senior Lieutenant Role in the Union Discord.", type: 1 },
            22: { title: "Follow from the Leader", description: "0xkaiserkarel is following you.", type: null },
            23: { title: "Junior Captain Role", description: "Received the Junior Captain Role in the Union Discord.", type: 1 },
            24: { title: "Captain Role", description: "Received the Captain Role in the Union Discord.", type: 1 },
            25: { title: "Senior Captain Role", description: "Received the Senior Captain Role in the Union Discord.", type: 1 },
            26: { title: "XP Boost 20", description: "Attended the community call on the 11th of March, 2025.", type: 2, xp: 20 },
            27: { title: "Mad! MAD!!", description: "Received the Mad! MAD!! Role in the Union Discord.", type: 1 },
            28: { title: "Raccoon Role", description: "Received the Trash Panda role in the Union Discord", type: 1 },
            29: { title: "XP Boost 20", description: "Asked insightful questions during the Coinhunters Twitter Space on 24th of March 2025", type: 2, xp: 20 },
            30: { title: "XP Boost 20", description: "Attended the community call on the 15th of April, 2025.", type: 2, xp: 20 },
            31: { title: "Localhost", description: "Helped to organize the Union Nigeria meetup on 27th of March 2025", type: 2, xp: 10 },
            32: { title: "XP Boost 20", description: "Attended the community call on the 13th of May, 2025.", type: 2, xp: 20 },
            33: { title: "XP Boost 20", description: "Winner of Chinese Discord channel giveaway in May, 2025.", type: 2, xp: 20 },
            34: { title: "XP Boost 20", description: "Attended the community call on the 10th of June, 2025.", type: 2, xp: 20 }
        };
        
        const levelSummary = {};
        let totalProcessedUsers = 0;
        let totalUsersWithAchievements = 0;
        let totalAchievements = 0;
        let totalErrors = 0;
        
        // Helper function to save and update CSV files
        const saveProgressAndUpdateCSV = (level, processedLines, levelCsvRows, levelPath) => {
            try {
                // Save achievements CSV
                if (levelCsvRows.length > 1) {
                    const levelCsvPath = path.join(dbDir, `rewards_level_${level}.csv`);
                    fs.writeFileSync(levelCsvPath, levelCsvRows.join('\n'), 'utf8');
                    console.log(`✅ Saved ${levelCsvRows.length - 1} achievements to ${levelCsvPath}`);
                }
                
                // Update source CSV by removing processed lines
                const csvData = fs.readFileSync(levelPath, 'utf8');
                const lines = csvData.split(/\r?\n/);
                const header = lines[0];
                const remainingLines = lines.slice(1 + processedLines.length);
                
                const updatedCsv = [header, ...remainingLines].join('\n');
                fs.writeFileSync(levelPath, updatedCsv, 'utf8');
                console.log(`✅ Removed ${processedLines.length} processed lines from source CSV`);
                
                return true;
            } catch (saveError) {
                console.error(`❌ Error saving progress for level ${level}:`, saveError.message);
                return false;
            }
        };
        
        // Determine which levels to process
        const levelsToProcess = testLevel ? [testLevel] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        
        console.log(`🚀 Processing levels: ${levelsToProcess.join(', ')} with batch size: ${batchSize}`);
        
        // Process each level
        for (const level of levelsToProcess) {
            const levelFileName = `leaderboard_level_${level}_from_csv.csv`;
            const levelPath = path.join(dbDir, levelFileName);
            
            if (!fs.existsSync(levelPath)) {
                console.log(`Level ${level} file not found: ${levelFileName}`);
                levelSummary[level] = {
                    fileExists: false,
                    processed: 0,
                    withAchievements: 0,
                    totalAchievements: 0,
                    errors: 0
                };
                continue;
            }
            
            console.log(`📂 Processing level ${level}...`);
            
            // Read level CSV file
            const csvData = fs.readFileSync(levelPath, 'utf8');
            const lines = csvData.split(/\r?\n/);
            const dataLines = lines.slice(1).filter(line => line.trim()); // Skip header
            
            if (dataLines.length === 0) {
                console.log(`✅ Level ${level} already completed - no users left to process`);
                levelSummary[level] = {
                    fileExists: true,
                    totalUsers: 0,
                    processed: 0,
                    withAchievements: 0,
                    totalAchievements: 0,
                    errors: 0,
                    status: 'completed'
                };
                continue;
            }
            
            console.log(`📊 Level ${level}: ${dataLines.length} users remaining to process`);
            
            // CSV for this level's achievements (check if exists and load)
            const levelCsvPath = path.join(dbDir, `rewards_level_${level}.csv`);
            let levelCsvRows = [];
            
            if (fs.existsSync(levelCsvPath)) {
                const existingCsv = fs.readFileSync(levelCsvPath, 'utf8');
                levelCsvRows = existingCsv.split(/\r?\n/).filter(line => line.trim());
                console.log(`📁 Found existing rewards file with ${levelCsvRows.length - 1} achievements`);
            } else {
                levelCsvRows = ['level,user_id,display_name,reward_id,reward_title,reward_description,reward_type,xp_bonus,created_at'];
            }
            
            let levelProcessed = 0;
            let levelWithAchievements = 0;
            let levelTotalAchievements = 0;
            let levelErrors = 0;
            let processedLinesInBatch = [];
            
            // Process users in batches
            for (let i = 0; i < dataLines.length; i += batchSize) {
                const batch = dataLines.slice(i, i + batchSize);
                const batchNumber = Math.floor(i/batchSize) + 1;
                const totalBatches = Math.ceil(dataLines.length/batchSize);
                
                console.log(`\n🔄 Level ${level} - Batch ${batchNumber}/${totalBatches} (${batch.length} users)`);
                
                for (const line of batch) {
                    try {
                        levelProcessed++;
                        
                        // Parse CSV line to extract jsonInput
                        let displayName = '';
                        let jsonInputStr = '';
                        
                        if (line.startsWith('"')) {
                            // "display_name","jsonInput" formatı
                            const firstQuoteEnd = line.indexOf('","');
                            if (firstQuoteEnd !== -1) {
                                displayName = line.substring(1, firstQuoteEnd);
                                jsonInputStr = line.substring(firstQuoteEnd + 3);
                                if (jsonInputStr.endsWith('"')) {
                                    jsonInputStr = jsonInputStr.slice(0, -1);
                                }
                            } else {
                                levelErrors++;
                                processedLinesInBatch.push(line);
                                continue;
                            }
                        } else {
                            const commaIndex = line.indexOf(',');
                            if (commaIndex !== -1) {
                                displayName = line.substring(0, commaIndex);
                                jsonInputStr = line.substring(commaIndex + 1);
                            } else {
                                levelErrors++;
                                processedLinesInBatch.push(line);
                                continue;
                            }
                        }
                        
                        // Parse jsonInput to get user_id
                        let userId = null;
                        try {
                            const cleanJsonStr = jsonInputStr.replace(/""/g, '"');
                            const jsonData = JSON.parse(cleanJsonStr);
                            userId = jsonData.user_id;
                        } catch (e) {
                            levelErrors++;
                            processedLinesInBatch.push(line);
                            continue;
                        }
                        
                        if (!userId) {
                            levelErrors++;
                            processedLinesInBatch.push(line);
                            continue;
                        }
                        
                        // Fetch achievements for this user_id
                        try {
                            const achievementsUrl = `https://api.dashboard.union.build/rest/v1/user_rewards_with_queue?select=*&user_id=eq.${userId}&order=created_at.desc`;
                            const response = await axios.get(achievementsUrl, {
                                headers: {
                                    'apikey': achievementsApiKey,
                                    'Authorization': `Bearer ${authToken}`,
                                    'Content-Type': 'application/json',
                                }
                            });
                            
                            const achievements = response.data;
                            
                            if (achievements && achievements.length > 0) {
                                levelWithAchievements++;
                                levelTotalAchievements += achievements.length;
                                
                                // Add each achievement to level CSV
                                achievements.forEach(achievement => {
                                    const rewardId = achievement.reward_id;
                                    const rewardInfo = rewardDefinitions[rewardId] || {};
                                    
                                    const title = rewardInfo.title || 'Unknown Achievement';
                                    const description = (rewardInfo.description || 'Achievement details not available').replace(/"/g, '""');
                                    const type = rewardInfo.type || 'unknown';
                                    const xpBonus = rewardInfo.xp || '';
                                    const createdAt = achievement.created_at || '';
                                    
                                    levelCsvRows.push(`"${level}","${userId}","${displayName.replace(/"/g, '""')}","${rewardId}","${title.replace(/"/g, '""')}","${description}","${type}","${xpBonus}","${createdAt}"`);
                                });
                                
                                console.log(`  ✅ ${displayName}: ${achievements.length} achievements found`);
                            } else {
                                console.log(`  ⚪ ${displayName}: No achievements`);
                            }
                            
                            // Mark line as processed
                            processedLinesInBatch.push(line);
                            
                            // Küçük delay to avoid rate limiting (sadece fast mode değilse)
                            if (!skipDelay) {
                                await new Promise(resolve => setTimeout(resolve, 25));
                            }
                            
                        } catch (apiError) {
                            // Check for 401 error - stop the process
                            if (apiError.response && apiError.response.status === 401) {
                                console.error(`\n🚨 401 UNAUTHORIZED ERROR - TOKEN EXPIRED!`);
                                console.error(`❌ Stopping process. Level ${level}, User: ${displayName}`);
                                console.error(`🔄 Please refresh your token and restart the process.`);
                                
                                // Save current progress before stopping
                                saveProgressAndUpdateCSV(level, processedLinesInBatch, levelCsvRows, levelPath);
                                
                                return res.status(401).json({
                                    error: 'AUTHENTICATION_EXPIRED',
                                    message: 'API token has expired. Please refresh your token and restart the process.',
                                    progress: {
                                        level: level,
                                        processedInLevel: levelProcessed,
                                        lastUser: displayName,
                                        savedToCSV: true
                                    }
                                });
                            }
                            
                            console.error(`  ❌ Error for ${displayName} (${userId}): ${apiError.message}`);
                            levelErrors++;
                            processedLinesInBatch.push(line);
                        }
                        
                    } catch (error) {
                        levelErrors++;
                        processedLinesInBatch.push(line);
                    }
                }
                
                // Save progress after each batch
                console.log(`\n💾 Saving batch progress...`);
                const saved = saveProgressAndUpdateCSV(level, processedLinesInBatch, levelCsvRows, levelPath);
                
                if (!saved) {
                    console.error(`❌ Failed to save progress for level ${level}, stopping process`);
                    break;
                }
                
                // Reset processed lines for next batch
                processedLinesInBatch = [];
                
                console.log(`✅ Batch ${batchNumber}/${totalBatches} completed. Progress: ${levelProcessed}/${dataLines.length} users`);
                
                // Batch arası pause (sadece fast mode değilse)
                if (!skipDelay && i + batchSize < dataLines.length) {
                    console.log(`⏳ Waiting 2 seconds before next batch...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            // Final save for this level
            console.log(`\n🎯 Level ${level} completed!`);
            
            // Update summary
            levelSummary[level] = {
                fileExists: true,
                totalUsers: dataLines.length,
                processed: levelProcessed,
                withAchievements: levelWithAchievements,
                totalAchievements: levelTotalAchievements,
                errors: levelErrors,
                csvFile: levelCsvRows.length > 1 ? `rewards_level_${level}.csv` : null,
                status: 'completed'
            };
            
            // Update totals
            totalProcessedUsers += levelProcessed;
            totalUsersWithAchievements += levelWithAchievements;
            totalAchievements += levelTotalAchievements;
            totalErrors += levelErrors;
            
            console.log(`📊 Level ${level} summary: ${levelProcessed} users processed, ${levelWithAchievements} with achievements, ${levelTotalAchievements} total achievements, ${levelErrors} errors`);
        }
        
        console.log(`\n🎉 All levels completed!`);
        
        res.json({
            message: '✅ Level-based achievements exported successfully with safe batch processing',
            summary: {
                totalProcessedUsers: totalProcessedUsers,
                totalUsersWithAchievements: totalUsersWithAchievements,
                totalAchievements: totalAchievements,
                totalErrors: totalErrors,
                levelsProcessed: Object.keys(levelSummary).length,
                batchSize: batchSize,
                safeMode: true
            },
            levelDetails: levelSummary
        });
        
    } catch (error) {
        console.error('Export achievements by levels error:', error);
        res.status(500).json({ 
            message: 'Error exporting achievements by levels', 
            error: error.message 
        });
    }
});

// Yeni endpoint: Level bazında rewards CSV dosyalarından özel rollerin sayısını hesapla
router.get('/count-special-roles-by-levels', async (req, res) => {
    const dbDir = path.join(__dirname, '../db');
    
    try {
        // Aradığımız özel roller
        const specialRoles = {
            'OG': 'OG',
            'Fanatic': 'Fanatic',
            'Whale Shark role': 'Whale Shark role'
        };
        
        const levelResults = {};
        let totalCounts = {
            'OG': 0,
            'Fanatic': 0,
            'Whale Shark role': 0
        };
        
        let totalProcessedLevels = 0;
        let totalProcessedUsers = 0;
        let totalProcessedRewards = 0;
        
        // Her level için rewards CSV dosyasını kontrol et
        for (let level = 1; level <= 10; level++) {
            const csvFileName = `rewards_level_${level}.csv`;
            const csvPath = path.join(dbDir, csvFileName);
            
            levelResults[level] = {
                fileExists: false,
                processedUsers: 0,
                processedRewards: 0,
                roleCounts: {
                    'OG': 0,
                    'Fanatic': 0,
                    'Whale Shark role': 0
                },
                errors: 0
            };
            
            if (fs.existsSync(csvPath)) {
                levelResults[level].fileExists = true;
                totalProcessedLevels++;
                
                try {
                    const csvData = fs.readFileSync(csvPath, 'utf8');
                    const lines = csvData.split(/\r?\n/);
                    
                    if (lines.length > 1) { // Header + data varsa
                        const dataLines = lines.slice(1).filter(line => line.trim());
                        levelResults[level].processedRewards = dataLines.length;
                        totalProcessedRewards += dataLines.length;
                        
                        const uniqueUsers = new Set();
                        
                        for (const line of dataLines) {
                            try {
                                // CSV parsing: level,user_id,display_name,reward_id,reward_title,reward_description,reward_type,xp_bonus,created_at
                                const columns = line.split(',');
                                
                                if (columns.length >= 5) {
                                    const userId = columns[1]?.trim().replace(/"/g, '');
                                    const rewardTitle = columns[4]?.trim().replace(/"/g, '');
                                    
                                    if (userId) {
                                        uniqueUsers.add(userId);
                                    }
                                    
                                    // Özel rolleri kontrol et
                                    for (const [roleKey, roleTitle] of Object.entries(specialRoles)) {
                                        if (rewardTitle === roleTitle) {
                                            levelResults[level].roleCounts[roleKey]++;
                                            totalCounts[roleKey]++;
                                        }
                                    }
                                }
                            } catch (parseError) {
                                levelResults[level].errors++;
                            }
                        }
                        
                        levelResults[level].processedUsers = uniqueUsers.size;
                        totalProcessedUsers += uniqueUsers.size;
                    }
                    
                } catch (fileError) {
                    console.error(`Error reading level ${level} rewards file:`, fileError.message);
                    levelResults[level].errors++;
                }
            }
        }
        
        res.json({
            message: 'Özel roller level bazında başarıyla sayıldı',
            searchedRoles: Object.values(specialRoles),
            levelBreakdown: levelResults,
            summary: {
                totalProcessedLevels: totalProcessedLevels,
                totalProcessedUsers: totalProcessedUsers,
                totalProcessedRewards: totalProcessedRewards,
                totalRoleCounts: totalCounts,
                totalSpecialRoleHolders: Object.values(totalCounts).reduce((sum, count) => sum + count, 0)
            }
        });
        
    } catch (error) {
        console.error('Count special roles error:', error);
        res.status(500).json({ 
            message: 'Özel roller sayma hatası', 
            error: error.message 
        });
    }
});

// Yeni endpoint: Tüm kullanıcılar için achievements çekip CSV'ye kaydet (ESKİ VERSİYON - YAVAS)
router.get('/export-all-achievements-to-csv-old', async (req, res) => {
    const dbDir = path.join(__dirname, '../db');
    const csvPath = path.join(dbDir, 'dashboard_rewards.csv');
    
    try {
        // Supabase API credentials
        const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dmxxYnR3cWV0bHRkY3Zpb2llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwMjM4MzMsImV4cCI6MjA2OTU5OTgzM30.d-leDFpzc6uxDvq47_FC0Fqh0ztaL11Oozm-z6T9N_M';
        const supabaseUrl = 'https://bvvlqbtwqetltdcvioie.supabase.co/rest/v1';
        
        // Achievements API credentials
        const achievementsApiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcnF6cHVyeXJnZm5lY2FkYWpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQzNzM0NDAsImV4cCI6MjA0OTk0OTQ0MH0.4xkWpfMkYgBz4nqUGkZVjQNP7NxLa4filDoJRCI3yWo';
        const authToken = 'eyJhbGciOiJIUzI1NiIsImtpZCI6IndaRTlJNnZYc1RqMXlaVVAiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3VvcnF6cHVyeXJnZm5lY2FkYWpvLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI4NDMxZjljZC1iMTNjLTRhZGUtODJiYi0zMGUxMGU0NTNlMzciLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzU0MjQzNTE4LCJpYXQiOjE3NTQyMzk5MTgsImVtYWlsIjoiYWxpLnR1enVuMTFAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJkaXNjb3JkIiwicHJvdmlkZXJzIjpbImRpc2NvcmQiLCJnaXRodWIiLCJ0d2l0dGVyIl19LCJ1c2VyX21ldGFkYXRhIjp7ImF2YXRhcl91cmwiOiJodHRwczovL3Bicy50d2ltZy5jb20vcHJvZmlsZV9pbWFnZXMvMTk0NzI0MDg0NjQ2Nzc2NDIyNC9JQmVncS04UF9ub3JtYWwuanBnIiwiY3VzdG9tX2NsYWltcyI6eyJnbG9iYWxfbmFtZSI6Ikh6TWVsa29yIn0sImVtYWlsIjoiYWxpLnR1enVuMTFAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZ1bGxfbmFtZSI6Ik1lbGtvci51bmlvbiIsImlzcyI6Imh0dHBzOi8vYXBpLnR3aXR0ZXIuY29tLzEuMS9hY2NvdW50L3ZlcmlmeV9jcmVkZW50aWFscy5qc29uIiwibmFtZSI6Ik1lbGtvci51bmlvbiIsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwicGljdHVyZSI6Imh0dHBzOi8vcGJzLnR3aW1nLmNvbS9wcm9maWxlX2ltYWdlcy8xOTQ3MjQwODQ2NDY3NzY0MjI0L0lCZWdxLThQX25vcm1hbC5qcGciLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJyaWNobmZ0Y3J5cHRvIiwicHJvdmlkZXJfaWQiOiIxMzQ5MzEwOTA2NDM4NjYwMDk4Iiwic3ViIjoiMTM0OTMxMDkwNjQzODY2MDA5OCIsInVzZXJfbmFtZSI6InJpY2huZnRjcnlwdG8ifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJvYXV0aCIsInRpbWVzdGFtcCI6MTc1MzE4MTE4M31dLCJzZXNzaW9uX2lkIjoiMGY3Nzg2ZTQtODdiMi00NzBiLWI4MzgtOGRhNmIxYjc5NzU3IiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.2GJOlH0-Edo9WdV20mVX6gMDnFWRDZBsy82AYb1ML2Q';
        
        // Fetch all users from leaderboard_full_0208
        console.log('Fetching all users from leaderboard_full_0208...');
        const leaderboardUrl = `${supabaseUrl}/leaderboard_full_0408?select=display_name,jsonInput`;
        const leaderboardResponse = await axios.get(leaderboardUrl, {
            headers: {
                'apikey': apiKey,
                'Content-Type': 'application/json',
            }
        });
        
        const users = leaderboardResponse.data;
        console.log(`Found ${users.length} users in leaderboard_full_0408`);
        
        // CSV header
        const csvRows = [
            'user_id,username,display_name,reward_id,reward_title,reward_description,reward_type,xp_bonus,created_at'
        ];
        
        let processedUsers = 0;
        let usersWithAchievements = 0;
        let totalAchievements = 0;
        let errors = 0;
        
        // Reward definitions mapping
        const rewardDefinitions = {
            1: { title: "Goblin role", description: "Received the Goblin role in the Union Discord.", type: 1 },
            2: { title: "Whaleshark Whitelist Stage 1", description: "Whitelisted for the whaleshark NFT.", type: null },
            3: { title: "Sloth role", description: "Received the LUnion role in the Union Discord.", type: 1 },
            4: { title: "Bad Kids role", description: "Received the Bad Kids role in the Union Discord.", type: 1 },
            5: { title: "V-On-Vana role", description: "Received the V-Union role in the Union Discord.", type: 1 },
            6: { title: "OG", description: "Received the OG role in the Union Discord.", type: 1 },
            7: { title: "Fanatic", description: "Received the fanatic role in the Union Discord.", type: 1 },
            9: { title: "Whaleshark Whitelist Stage 2", description: "Whitelisted for the whaleshark NFT stage 2. Make sure to add a Cosmos wallet address to remain eligble.", type: null },
            11: { title: "Whale Shark role", description: "Received the Whale Shark role in the Union Discord.", type: 1 },
            12: { title: "Mammoth Role", description: "Received the Mammoth Role in the Union Discord.", type: 1 },
            13: { title: "Conscript Role", description: "Received the Conscript Role in the Union Discord.", type: 1 },
            14: { title: "Private First Class Role", description: "Received the Private First Class Role in the Union Discord.", type: 1 },
            15: { title: "Junior Sergeant Role", description: "Received the Junior Sergeant Role in the Union Discord.", type: 1 },
            16: { title: "Sergeant Role", description: "Received the Sergeant Role in the Union Discord.", type: 1 },
            17: { title: "Senior Sergeant Role", description: "Received the Senior Sergeant Role in the Union Discord.", type: 1 },
            18: { title: "Starshina Role", description: "Received the Starshina Role in the Union Discord.", type: 1 },
            19: { title: "Junior Lieutenant Role", description: "Received the Junior Lieutenant Role in the Union Discord.", type: 1 },
            20: { title: "Lieutenant Role", description: "Received the Lieutenant Role in the Union Discord.", type: 1 },
            21: { title: "Senior Lieutenant Role", description: "Received the Senior Lieutenant Role in the Union Discord.", type: 1 },
            22: { title: "Follow from the Leader", description: "0xkaiserkarel is following you.", type: null },
            23: { title: "Junior Captain Role", description: "Received the Junior Captain Role in the Union Discord.", type: 1 },
            24: { title: "Captain Role", description: "Received the Captain Role in the Union Discord.", type: 1 },
            25: { title: "Senior Captain Role", description: "Received the Senior Captain Role in the Union Discord.", type: 1 },
            26: { title: "XP Boost 20", description: "Attended the community call on the 11th of March, 2025.", type: 2, xp: 20 },
            27: { title: "Mad! MAD!!", description: "Received the Mad! MAD!! Role in the Union Discord.", type: 1 },
            28: { title: "Raccoon Role", description: "Received the Trash Panda role in the Union Discord", type: 1 },
            29: { title: "XP Boost 20", description: "Asked insightful questions during the Coinhunters Twitter Space on 24th of March 2025", type: 2, xp: 20 },
            30: { title: "XP Boost 20", description: "Attended the community call on the 15th of April, 2025.", type: 2, xp: 20 },
            31: { title: "Localhost", description: "Helped to organize the Union Nigeria meetup on 27th of March 2025", type: 2, xp: 10 },
            32: { title: "XP Boost 20", description: "Attended the community call on the 13th of May, 2025.", type: 2, xp: 20 },
            33: { title: "XP Boost 20", description: "Winner of Chinese Discord channel giveaway in May, 2025.", type: 2, xp: 20 },
            34: { title: "XP Boost 20", description: "Attended the community call on the 10th of June, 2025.", type: 2, xp: 20 }
        };
        
        // Process users in batches to avoid overwhelming the API
        const batchSize = 50;
        for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            
            console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(users.length/batchSize)} (${batch.length} users)`);
            
            for (const user of batch) {
                try {
                    processedUsers++;
                    
                    // Extract user_id from jsonInput
                    let userId = null;
                    const username = user.username || user.display_name || 'unknown';
                    const displayName = user.display_name || user.username || 'unknown';
                    
                    if (user.jsonInput) {
                        try {
                            const jsonData = typeof user.jsonInput === 'string' ? 
                                JSON.parse(user.jsonInput) : user.jsonInput;
                            userId = jsonData.user_id;
                        } catch (e) {
                            console.error(`Error parsing jsonInput for user ${username}:`, e);
                            errors++;
                            continue;
                        }
                    }
                    
                    if (!userId) {
                        console.log(`No user_id found for user: ${username}`);
                        errors++;
                        continue;
                    }
                    
                    // Fetch achievements for this user_id
                    try {
                        const achievementsUrl = `https://api.dashboard.union.build/rest/v1/user_rewards_with_queue?select=*&user_id=eq.${userId}&order=created_at.desc`;
                        const achievementsResponse = await axios.get(achievementsUrl, {
                            headers: {
                                'apikey': achievementsApiKey,
                                'Authorization': `Bearer ${authToken}`,
                                'Content-Type': 'application/json',
                            }
                        });
                        
                        const achievements = achievementsResponse.data;
                        
                        if (achievements && achievements.length > 0) {
                            usersWithAchievements++;
                            totalAchievements += achievements.length;
                            
                            // Add each achievement to CSV
                            achievements.forEach(achievement => {
                                const rewardId = achievement.reward_id;
                                const rewardInfo = rewardDefinitions[rewardId] || {};
                                
                                const title = rewardInfo.title || 'Unknown Achievement';
                                const description = (rewardInfo.description || 'Achievement details not available').replace(/"/g, '""');
                                const type = rewardInfo.type || 'unknown';
                                const xpBonus = rewardInfo.xp || '';
                                const createdAt = achievement.created_at || '';
                                
                                csvRows.push(`"${userId}","${username.replace(/"/g, '""')}","${displayName.replace(/"/g, '""')}","${rewardId}","${title.replace(/"/g, '""')}","${description}","${type}","${xpBonus}","${createdAt}"`);
                            });
                        }
                        
                        // Add small delay to avoid rate limiting
                        await new Promise(resolve => setTimeout(resolve, 100));
                        
                    } catch (achievementError) {
                        console.error(`Error fetching achievements for user_id ${userId}:`, achievementError.message);
                        errors++;
                    }
                    
                } catch (userError) {
                    console.error(`Error processing user ${user.username || user.display_name}:`, userError.message);
                    errors++;
                }
            }
            
            // Log progress
            console.log(`Batch completed. Progress: ${processedUsers}/${users.length} users processed`);
        }
        
        // Write CSV file
        fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');
        
        res.json({
            message: 'All user achievements exported to CSV successfully',
            csvFile: csvPath,
            stats: {
                totalUsers: users.length,
                processedUsers: processedUsers,
                usersWithAchievements: usersWithAchievements,
                totalAchievements: totalAchievements,
                totalCsvRows: csvRows.length - 1, // excluding header
                errors: errors
            }
        });
        
    } catch (error) {
        console.error('Export all achievements error:', error);
        res.status(500).json({ 
            message: 'Error exporting all user achievements', 
            error: error.message 
        });
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

// Yeni endpoint: leaderboard_export.csv dosyasını Supabase leaderboard_full_0408 tablosuna import et
router.post('/import-leaderboard-to-supabase', async (req, res) => {
    try {
        // Supabase credentials - updated with correct keys
        const supabaseUrl = 'https://bvvlqbtwqetltdcvioie.supabase.co';
        const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dmxxYnR3cWV0bHRkY3Zpb2llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwMjM4MzMsImV4cCI6MjA2OTU5OTgzM30.d-leDFpzc6uxDvq47_FC0Fqh0ztaL11Oozm-z6T9N_M';

        console.log('🚀 Starting leaderboard import to Supabase...');

        // CSV dosyasını oku
        const csvPath = path.join(__dirname, '../db/leaderboard_export.csv');
        if (!fs.existsSync(csvPath)) {
            return res.status(404).json({ message: 'leaderboard_export.csv dosyası bulunamadı' });
        }

        const csvData = fs.readFileSync(csvPath, 'utf8');
        const lines = csvData.split(/\r?\n/).slice(1); // başlık hariç

        console.log(`📊 Total lines to process: ${lines.length}`);

        let totalProcessed = 0;
        let totalInserted = 0;
        let totalErrors = 0;
        const errors = [];

        const batchSize = 100; // Supabase batch insert size
        let batch = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            try {
                // CSV formatı: "display_name","jsonInput"
                const match = line.match(/^"([^"]+)","(.+)"$/);
                if (!match) {
                    console.log(`⚠️ Skipping invalid line ${i + 1}: ${line.substring(0, 100)}...`);
                    continue;
                }

                const displayName = match[1];
                const jsonInputStr = match[2].replace(/""/g, '"'); // Escape edilmiş çift tırnakları düzelt

                let jsonInput;
                try {
                    jsonInput = JSON.parse(jsonInputStr);
                } catch (parseError) {
                    console.log(`⚠️ JSON parse error for ${displayName}:`, parseError.message);
                    totalErrors++;
                    errors.push(`JSON parse error for ${displayName}: ${parseError.message}`);
                    continue;
                }

                // Batch'e ekle
                batch.push({
                    display_name: displayName,
                    jsonInput: jsonInput
                });

                totalProcessed++;

                // Batch dolu ise Supabase'e gönder
                if (batch.length >= batchSize || i === lines.length - 1) {
                    try {
                        // Insert batch to Supabase
                        const response = await axios({
                            method: 'POST',
                            url: `${supabaseUrl}/rest/v1/leaderboard_full_0408`,
                            headers: {
                                'apikey': supabaseKey,
                                'Authorization': `Bearer ${supabaseKey}`,
                                'Content-Type': 'application/json',
                                'Prefer': 'return=minimal'
                            },
                            data: batch
                        });

                        totalInserted += batch.length;
                        console.log(`✅ Batch inserted: ${batch.length} records (Total: ${totalInserted}/${totalProcessed})`);
                        
                    } catch (insertError) {
                        console.error('❌ Batch insert error:', insertError.response?.data || insertError.message);
                        totalErrors += batch.length;
                        errors.push(`Batch insert error: ${insertError.response?.data?.message || insertError.message}`);
                    }

                    // Reset batch
                    batch = [];
                }

            } catch (lineError) {
                console.error(`❌ Error processing line ${i + 1}:`, lineError.message);
                totalErrors++;
                errors.push(`Line ${i + 1} error: ${lineError.message}`);
            }
        }

        console.log('🎉 Leaderboard import completed!');
        console.log(`📊 Summary: ${totalInserted} inserted, ${totalErrors} errors out of ${totalProcessed} processed`);

        res.json({
            success: true,
            message: 'Leaderboard import to Supabase completed',
            summary: {
                totalProcessed,
                totalInserted,
                totalErrors,
                table: 'leaderboard_full_0408'
            },
            errors: errors.slice(0, 10) // İlk 10 hatayı göster
        });

    } catch (error) {
        console.error('💥 Critical error during leaderboard import:', error);
        res.status(500).json({
            success: false,
            message: 'Leaderboard import to Supabase failed', 
            error: error.message,
            stack: error.stack
        });
    }
});