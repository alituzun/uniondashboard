

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
            const levelFileName = `leaderboard_level_${lvl}.csv`;
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