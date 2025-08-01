document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('searchForm');
    const resultDiv = document.getElementById('result');
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        if (!username) {
            resultDiv.innerHTML = '<span style="color:red">Please enter a username.</span>';
            return;
        }
        resultDiv.innerHTML = 'Loading...';
        try {
            // Supabase REST API'den leaderboard_full tablosunda önce display_name eq, sonra username eq, sonra display_name ilike, sonra username ilike ile arama
            const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2dmxxYnR3cWV0bHRkY3Zpb2llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwMjM4MzMsImV4cCI6MjA2OTU5OTgzM30.d-leDFpzc6uxDvq47_FC0Fqh0ztaL11Oozm-z6T9N_M';
            const supabaseUrl = 'https://bvvlqbtwqetltdcvioie.supabase.co/rest/v1';
            let user = null;
            let url, response, users;
            // 1. display_name eq
            url = `${supabaseUrl}/leaderboard_full?display_name=eq.${username}`;
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
            // 2. username eq
            if (!user) {
                url = `${supabaseUrl}/leaderboard_full?username=eq.${username}`;
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
            // 3. display_name ilike (partial match, % doğrudan yazılır ve encode edilmez)
            if (!user) {
                url = `${supabaseUrl}/leaderboard_full?display_name=ilike.%${username}%`;
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
                url = `${supabaseUrl}/leaderboard_full?username=ilike.%${username}%`;
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
                resultDiv.innerHTML = `<span style='color:red'>User not found. (display_name ve username eq/ilike ile, hem tam hem içinde geçen arandı)</span>`;
                return;
            }
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
            if (user.jsonInput) {
                try {
                    const json = typeof user.jsonInput === 'string' ? JSON.parse(user.jsonInput) : user.jsonInput;
                    pfp = json.pfp || pfp;
                    total_xp = json.total_xp || total_xp;
                    level = json.level || level;
                    title = json.title || title;
                } catch (e) {}
            }
            html += `<div style='margin-bottom:12px;padding:8px 12px;background:#333;border-radius:8px;'>`;
            html += `<div><b>Username:</b> ${usernameOrDisplay ?? '-'}</div>`;
            html += `<div><b>Total XP:</b> ${total_xp ?? '-'}</div>`;
            html += `<div><b>Level :</b> ${level ?? '-'}</div>`;
            html += `<div><b>Title :</b> ${title ?? '-'}</div>`;
            html += `<div><b>Mindshare s1:</b> ${mindshare_s1}</div>`;
            html += `<div><b>Mindshare s0:</b> ${mindshare_s0}</div>`;
            html += `</div>`;
            if (pfp) {
                html += `<img src='${pfp}' alt='pfp' style='width:220px;height:220px;border-radius:16px;border:2px solid #2196f3;background:#fff;box-shadow:0 2px 16px #0006;margin-top:12px;'>`;
            }
            resultDiv.innerHTML = html;
        } catch (error) {
            resultDiv.innerHTML = `<span style='color:red'>Error: ${error.message}</span>`;
        }
    });
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