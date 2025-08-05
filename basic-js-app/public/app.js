document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('searchForm');
    const resultDiv = document.getElementById('result');
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        if (!username) {
            resultDiv.innerHTML = '<div style="color:#ff6b6b; text-align:center; padding:20px;">Please enter a username.</div>';
            document.getElementById('result').style.display = 'block';
            return;
        }
        resultDiv.innerHTML = '<div style="color:#aaa; text-align:center; padding:40px; font-size:1.1rem;">🔍 Loading user information...</div>';
        document.getElementById('result').style.display = 'block';
        try {
            // Supabase REST API'den leaderboard_full tablosunda önce display_name ilike (tam eşleşme), sonra username ilike (tam eşleşme), sonra display_name ilike (partial), sonra username ilike (partial) ile arama (hepsi case-insensitive)
            const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dmxxYnR3cWV0bHRkY3Zpb2llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwMjM4MzMsImV4cCI6MjA2OTU5OTgzM30.d-leDFpzc6uxDvq47_FC0Fqh0ztaL11Oozm-z6T9N_M';
            const supabaseUrl = 'https://bvvlqbtwqetltdcvioie.supabase.co/rest/v1';
            let user = null;
            let url, response, users;
            // 1. display_name ilike (tam eşleşme)
            url = `${supabaseUrl}/leaderboard_full_0408?display_name=ilike.${username}`;
            response = await fetch(url, {
                headers: {
                    'apikey': apiKey,
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                }
            });
            if (response.ok) {
                users = await response.json();
                if (users && users.length > 0) {
                    // Tam eşleşme kontrolü (case-insensitive)
                    user = users.find(u => (u.display_name || '').toLowerCase() === username.toLowerCase()) || null;
                }
            }
            // 2. username ilike (tam eşleşme)
            if (!user) {
                url = `${supabaseUrl}/leaderboard_full_0408?username=ilike.${username}`;
                response = await fetch(url, {
                    headers: {
                        'apikey': apiKey,
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    }
                });
                if (response.ok) {
                    users = await response.json();
                    if (users && users.length > 0) {
                        user = users.find(u => (u.username || '').toLowerCase() === username.toLowerCase()) || null;
                    }
                }
            }
            // 3. display_name ilike (partial match, % doğrudan yazılır ve encode edilmez)
            if (!user) {
                url = `${supabaseUrl}/leaderboard_full_0408?display_name=ilike.%${username}%`;
                response = await fetch(url, {
                    headers: {
                        'apikey': apiKey,
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    }
                });
                if (response.ok) {
                    users = await response.json();
                    if (users && users.length > 0) {
                        user = users[0];
                    }
                }
            }
            // 4. username ilike (partial match)
            if (!user) {
                url = `${supabaseUrl}/leaderboard_full_0408?username=ilike.%${username}%`;
                response = await fetch(url, {
                    headers: {
                        'apikey': apiKey,
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    }
                });
                if (response.ok) {
                    users = await response.json();
                    if (users && users.length > 0) {
                        user = users[0];
                    }
                }
            }
            if (!user) {
                resultDiv.innerHTML = `<div style='color:#ff6b6b; text-align:center; padding:30px; background:rgba(255, 107, 107, 0.1); border-radius:10px; border:1px solid rgba(255, 107, 107, 0.3);'>❌ User not found.<br><small style="color:#aaa; margin-top:10px; display:block;">Searched by display_name and username (exact and partial matches)</small></div>`;
                document.getElementById('result').style.display = 'block';
                return;
            }
            
            // Debug: Console'a user objesini yazdır
            console.log('Found user object:', user);
            console.log('User keys:', Object.keys(user));
            // Mindshare için yaps_season_one tablosundan çek
            // leaderboard_full tablosunda username yok, display_name'i username olarak kullan
            const usernameOrDisplay = user.username || user.display_name;
            // Mindshare için yaps_season_one tablosunda username ile arama
            let mindshare_s1 = '-';
            // Önce eq ile dene
            let yapsUrl = `${supabaseUrl}/yaps_season_one?username=eq.${encodeURIComponent(usernameOrDisplay)}`;
            let yapsRes = await fetch(yapsUrl, {
                headers: {
                    'apikey': apiKey,
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                }
            });
            let yapsData = [];
            if (yapsRes.ok) {
                yapsData = await yapsRes.json();
            }
            // eq ile bulunamazsa ilike ile tekrar dene
            if (!yapsData || yapsData.length === 0) {
                yapsUrl = `${supabaseUrl}/yaps_season_one?username=ilike.%25${usernameOrDisplay}%25`;
                yapsRes = await fetch(yapsUrl, {
                    headers: {
                        'apikey': apiKey,
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    }
                });
                if (yapsRes.ok) {
                    yapsData = await yapsRes.json();
                }
            }
            if (yapsData && yapsData.length > 0) {
                // Birden fazla eşleşme varsa, username tam eşleşen ilk objeyi bul
                let found = yapsData.find(d => (d.username || '').toLowerCase() === usernameOrDisplay.toLowerCase());
                if (!found) found = yapsData[0];
                let mindshareVal = null;
                let logJsonInput = null;
                if (found && found.jsonInput) {
                    try {
                        logJsonInput = found.jsonInput;
                        const json = typeof found.jsonInput === 'string' ? JSON.parse(found.jsonInput) : found.jsonInput;
                        if (json.mindshare !== undefined && json.mindshare !== null) {
                            mindshareVal = json.mindshare;
                        }
                    } catch (e) {
                        console.error('Error parsing jsonInput for season one:', found.jsonInput, e);
                    }
                }
                if (typeof mindshareVal === 'string') {
                    mindshareVal = mindshareVal.replace('%', '').trim();
                }
                if (mindshareVal !== null && !isNaN(mindshareVal)) {
                    let num = parseFloat(mindshareVal);
                    if (num < 1) {
                        mindshare_s1 = (num * 100).toFixed(2);
                    } else {
                        mindshare_s1 = num.toFixed(2);
                    }
                } else if (mindshareVal !== null) {
                    let num = parseFloat(String(mindshareVal).replace(',', '.'));
                    if (!isNaN(num)) {
                        if (num < 1) {
                            mindshare_s1 = (num * 100).toFixed(2);
                        } else {
                            mindshare_s1 = num.toFixed(2);
                        }
                    }
                }
            }
            // Mindshare için yaps_season_zero tablosundan da çek
            let mindshare_s0 = '-';
            let yapsZeroUrl = `${supabaseUrl}/yaps_season_zero?username=eq.${encodeURIComponent(usernameOrDisplay)}`;
            let yapsZeroRes = await fetch(yapsZeroUrl, {
                headers: {
                    'apikey': apiKey,
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                }
            });
            let yapsZeroData = [];
            if (yapsZeroRes.ok) {
                yapsZeroData = await yapsZeroRes.json();
            }
            // eq ile bulunamazsa ilike ile tekrar dene
            if (!yapsZeroData || yapsZeroData.length === 0) {
                yapsZeroUrl = `${supabaseUrl}/yaps_season_zero?username=ilike.%25${usernameOrDisplay}%25`;
                yapsZeroRes = await fetch(yapsZeroUrl, {
                    headers: {
                        'apikey': apiKey,
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    }
                });
                if (yapsZeroRes.ok) {
                    yapsZeroData = await yapsZeroRes.json();
                }
            }
            if (yapsZeroData && yapsZeroData.length > 0) {
                let found0 = yapsZeroData.find(d => (d.username || '').toLowerCase() === usernameOrDisplay.toLowerCase());
                if (!found0) found0 = yapsZeroData[0];
                let mindshareVal0 = null;
                let logJsonInput0 = null;
                if (found0 && found0.jsonInput) {
                    try {
                        logJsonInput0 = found0.jsonInput;
                        const json = typeof found0.jsonInput === 'string' ? JSON.parse(found0.jsonInput) : found0.jsonInput;
                        if (json.mindshare !== undefined && json.mindshare !== null) {
                            mindshareVal0 = json.mindshare;
                        }
                    } catch (e) {
                        console.error('Error parsing jsonInput for season zero:', found0.jsonInput, e);
                    }
                }
                if (typeof mindshareVal0 === 'string') {
                    mindshareVal0 = mindshareVal0.replace('%', '').trim();
                }
                if (mindshareVal0 !== null && !isNaN(mindshareVal0)) {
                    let num0 = parseFloat(mindshareVal0);
                    mindshare_s0 = num0.toFixed(2);
                } else if (mindshareVal0 !== null) {
                    let num0 = parseFloat(String(mindshareVal0).replace(',', '.'));
                    if (!isNaN(num0)) {
                        mindshare_s0 = num0.toFixed(2);
                    }
                }
            }
            let html = '';
            // leaderboard_full tablosunda pfp, total_xp, level, title gibi alanlar jsonInput içinde olabilir
            let pfp = user.pfp;
            let total_xp = user.total_xp;
            let level = user.level;
            let title = user.title;
            let user_id = null;
            
            if (user.jsonInput) {
                try {
                    const json = typeof user.jsonInput === 'string' ? JSON.parse(user.jsonInput) : user.jsonInput;
                    pfp = json.pfp || pfp;
                    total_xp = json.total_xp || total_xp;
                    level = json.level || level;
                    title = json.title || title;
                    user_id = json.user_id || null;
                } catch (e) {
                    console.error('Error parsing jsonInput:', e);
                }
            }
            
            console.log('Extracted user_id from jsonInput:', user_id);
            
            html += `<div style="text-align: center; margin-bottom: 25px;">`;
            html += `<h3 style="color: #4fc3f7; margin: 0 0 15px 0; font-size: 1.5rem;">User Information</h3>`;
            if (pfp) {
                html += `<img src='${pfp}' alt='Profile Picture' style='width:120px;height:120px;border-radius:50%;border:3px solid #4fc3f7;background:#fff;box-shadow:0 8px 25px rgba(79, 195, 247, 0.3);margin-bottom:20px;'>`;
            }
            html += `</div>`;
            
            html += `<div class="user-info">`;
            html += `<div class="info-item"><strong>Username</strong><div class="info-value">${usernameOrDisplay ?? '-'}</div></div>`;
            html += `<div class="info-item"><strong>Total XP</strong><div class="info-value">${total_xp ? total_xp.toLocaleString() : '-'}</div></div>`;
            html += `<div class="info-item"><strong>Level</strong><div class="info-value">${level ?? '-'}</div></div>`;
            html += `<div class="info-item"><strong>Title</strong><div class="info-value">${title ?? '-'}</div></div>`;
            html += `<div class="info-item"><strong>Mindshare S1</strong><div class="info-value">${mindshare_s1}%</div></div>`;
            html += `<div class="info-item"><strong>Mindshare S0</strong><div class="info-value">${mindshare_s0}%</div></div>`;
            html += `</div>`;
            
            // Achievements section placeholder
            html += `<div class="achievements-section">`;
            html += `<h3 class="achievements-title">🏆 Achievements</h3>`;
            html += `<div id="achievements-content" class="loading-achievements">Loading achievements...</div>`;
            html += `</div>`;
            
            document.getElementById('result').style.display = 'block';
            resultDiv.innerHTML = html;
            
            // Fetch achievements after displaying user info
            console.log('Trying to fetch achievements for user_id from jsonInput:', user_id);
            await fetchUserAchievements(user_id, usernameOrDisplay);
        } catch (error) {
            // Eğer fetch hatası veya 404 dışı bir hata varsa kullanıcıya sadece 'User not found.' göster
            let msg = '❌ User not found.';
            if (error && error.message && error.message.includes('404')) {
                msg = '❌ User not found.';
            }
            resultDiv.innerHTML = `<div style='color:#ff6b6b; text-align:center; padding:30px; background:rgba(255, 107, 107, 0.1); border-radius:10px; border:1px solid rgba(255, 107, 107, 0.3);'>${msg}<br><small style="color:#aaa; margin-top:10px; display:block;">Please check the username and try again</small></div>`;
            document.getElementById('result').style.display = 'block';
        }
    });
    
    // Function to fetch and display user achievements
    async function fetchUserAchievements(userId, username) {
        try {
            console.log('fetchUserAchievements called with userId:', userId, 'username:', username);
            
            // Supabase credentials for rewards table
            const supabaseUrl = 'https://bvvlqbtwqetltdcvioie.supabase.co/rest/v1';
            const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dmxxYnR3cWV0bHRkY3Zpb2llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwMjM4MzMsImV4cCI6MjA2OTU5OTgzM30.d-leDFpzc6uxDvq47_FC0Fqh0ztaL11Oozm-z6T9N_M';
            
            let attempts = [];
            
            // 1. Try with user_id if available
            if (userId) {
                attempts.push({
                    url: `${supabaseUrl}/rewards?user_id=eq.${userId}&order=created_at.desc`,
                    description: 'user_id field'
                });
            }
            
            // 2. Try with display_name
            if (username) {
                attempts.push({
                    url: `${supabaseUrl}/rewards?display_name=eq.${username}&order=created_at.desc`,
                    description: 'display_name field (exact match)'
                });
            }
            
            // 3. Try with display_name partial match
            if (username) {
                attempts.push({
                    url: `${supabaseUrl}/rewards?display_name=ilike.*${username}*&order=created_at.desc`,
                    description: 'display_name field (partial match)'
                });
            }
            
            for (let attempt of attempts) {
                console.log(`Trying Supabase rewards API with ${attempt.description}:`, attempt.url);
                
                const response = await fetch(attempt.url, {
                    headers: {
                        'apikey': apiKey,
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    }
                });
                
                console.log(`Supabase rewards API response status for ${attempt.description}:`, response.status);
                
                if (response.ok) {
                    const achievements = await response.json();
                    console.log(`Supabase rewards response for ${attempt.description}:`, achievements);
                    
                    if (achievements && achievements.length > 0) {
                        console.log(`Found ${achievements.length} achievements using ${attempt.description}`);
                        displaySupabaseAchievements(achievements);
                        return;
                    }
                } else {
                    console.log(`Failed with ${attempt.description}: ${response.status} ${response.statusText}`);
                }
            }
            
            // If all attempts failed
            const achievementsContent = document.getElementById('achievements-content');
            achievementsContent.innerHTML = '<div class="no-achievements">No achievements found for this user.</div>';
            
        } catch (error) {
            console.error('Error fetching achievements from Supabase:', error);
            const achievementsContent = document.getElementById('achievements-content');
            achievementsContent.innerHTML = '<div class="no-achievements">Failed to load achievements. Please try again later.</div>';
        }
    }
    
    function displaySupabaseAchievements(achievements) {
        const achievementsContent = document.getElementById('achievements-content');
        let achievementsHtml = '<div class="achievements-grid">';
        
        achievements.forEach(achievement => {
            const createdDate = new Date(achievement.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            
            // Use data directly from Supabase rewards table
            const title = achievement.reward_title || 'Unknown Achievement';
            const description = achievement.reward_description || 'Achievement details not available';
            const rewardType = achievement.reward_type;
            const xpBonus = achievement.xp_bonus;
            
            let typeLabel = '';
            let xpBonusHtml = '';
            
            // Determine achievement type based on reward_type
            if (rewardType === '1') {
                typeLabel = 'Role';
            } else if (rewardType === '2') {
                typeLabel = 'XP Boost';
                if (xpBonus) {
                    xpBonusHtml = `<span class="achievement-xp">+${xpBonus} XP</span>`;
                }
            } else if (rewardType === null || rewardType === '') {
                typeLabel = 'Special';
            } else {
                typeLabel = 'Other';
            }
            
            achievementsHtml += `
                <div class="achievement-item">
                    <div class="achievement-title">${title}</div>
                    <div class="achievement-description">${description}</div>
                    <div class="achievement-meta">
                        <span class="achievement-type">${typeLabel}</span>
                        <span class="achievement-date">${createdDate}</span>
                        ${xpBonusHtml}
                    </div>
                </div>
            `;
        });
        
        achievementsHtml += '</div>';
        achievementsContent.innerHTML = achievementsHtml;
    }

    function displayAchievements(achievements) {
        const achievementsContent = document.getElementById('achievements-content');
        let achievementsHtml = '<div class="achievements-grid">';
        
        // Reward definitions mapping - based on the reward_id list you provided
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
        
        achievements.forEach(achievement => {
            const createdDate = new Date(achievement.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            
            // Get reward details from our mapping using reward_id
            const rewardId = achievement.reward_id;
            const rewardInfo = rewardDefinitions[rewardId];
            
            let typeLabel = '';
            let xpBonus = '';
            let title = 'Unknown Achievement';
            let description = 'Achievement details not available';
            
            if (rewardInfo) {
                title = rewardInfo.title;
                description = rewardInfo.description;
                
                // Determine achievement type
                if (rewardInfo.type === 1) {
                    typeLabel = 'Role';
                } else if (rewardInfo.type === 2) {
                    typeLabel = 'XP Boost';
                    if (rewardInfo.xp) {
                        xpBonus = `<span class="achievement-xp">+${rewardInfo.xp} XP</span>`;
                    }
                } else if (rewardInfo.type === null) {
                    typeLabel = 'Special';
                } else {
                    typeLabel = 'Other';
                }
            } else {
                // Fallback for unknown reward IDs
                typeLabel = 'Unknown';
                console.log('Unknown reward_id:', rewardId);
            }
            
            achievementsHtml += `
                <div class="achievement-item">
                    <div class="achievement-title">${title}</div>
                    <div class="achievement-description">${description}</div>
                    <div class="achievement-meta">
                        <span class="achievement-type">${typeLabel}</span>
                        <span class="achievement-date">${createdDate}</span>
                        ${xpBonus}
                    </div>
                </div>
            `;
        });
        
        achievementsHtml += '</div>';
        achievementsContent.innerHTML = achievementsHtml;
    }
});
const usernameInput = document.getElementById('username');
const fetchButton = document.getElementById('fetch-button');
const userInfoDisplay = document.getElementById('user-info');

fetchButton.addEventListener('click', async () => {
    const username = usernameInput.value;

    if (!username) {
        alert('Please enter a username.');
        return;
    }

    try {
        const response = await fetch(`/api/user/${username}`);
        if (!response.ok) {
            throw new Error('User not found.');
        }
        const userData = await response.json();
        userInfoDisplay.innerText = JSON.stringify(userData, null, 2);
    } catch (error) {
        alert('Error: ' + error.message);
    }
});