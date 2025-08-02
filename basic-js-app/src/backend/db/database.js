
const fs = require('fs');
const path = require('path');

function getLeaderboardFile(index = 0) {
    return path.join(__dirname, `leaderboard${index ? '_' + index : ''}.json`);
}

function getCurrentFileIndex() {
    let index = 0;
    while (fs.existsSync(getLeaderboardFile(index))) {
        const data = JSON.parse(fs.readFileSync(getLeaderboardFile(index), 'utf8'));
        if (data.length < 10000) return index;
        index++;
    }
    return index;
}

const saveLeaderboardInfo = async (username, leaderboardInfo) => {
    const fileIndex = getCurrentFileIndex();
    const leaderboardFile = getLeaderboardFile(fileIndex);
    let data = [];
    if (fs.existsSync(leaderboardFile)) {
        data = JSON.parse(fs.readFileSync(leaderboardFile, 'utf8'));
    }
    // Mevcut kullanıcıyı sil
    data = data.filter(item => item.username !== username);
    // Yeni veriyi ekle
    data.push({ username, ...leaderboardInfo });
    fs.writeFileSync(leaderboardFile, JSON.stringify(data, null, 2));
};

const getLeaderboardInfo = async (username) => {
    let index = 0;
    while (fs.existsSync(getLeaderboardFile(index))) {
        const data = JSON.parse(fs.readFileSync(getLeaderboardFile(index), 'utf8'));
        const found = data.find(item => item.username === username);
        if (found) return found;
        index++;
    }
    return null;
};

module.exports = {
    // Dummy fonksiyonlar, dosya tabanlı kullanımda gerek yok
    connectDB: async () => {},
    storeUserInfo: async () => {},
    getUserInfo: async () => {},
    refreshDatabase: async () => {},
    saveLeaderboardInfo,
    getLeaderboardInfo,
};