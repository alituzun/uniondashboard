const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY;

// Proxy endpoint for user info and mindshare
app.get('/api/user/:username', async (req, res) => {
    const username = req.params.username;
    if (!username) return res.status(400).json({ error: 'Username required' });

    try {
        // 1. leaderboard_full (display_name eq, username eq, display_name ilike, username ilike)
        let user = null;
        let url, response, users;
        // display_name eq
        url = `${SUPABASE_URL}/leaderboard_full?display_name=eq.${username}`;
        response = await fetch(url, {
            headers: {
                'apikey': SUPABASE_API_KEY,
                'Authorization': `Bearer ${SUPABASE_API_KEY}`,
                'Content-Type': 'application/json',
            }
        });
        if (response.ok) {
            users = await response.json();
            if (users && users.length > 0) user = users[0];
        }
        // username eq
        if (!user) {
            url = `${SUPABASE_URL}/leaderboard_full?username=eq.${username}`;
            response = await fetch(url, {
                headers: {
                    'apikey': SUPABASE_API_KEY,
                    'Authorization': `Bearer ${SUPABASE_API_KEY}`,
                    'Content-Type': 'application/json',
                }
            });
            if (response.ok) {
                users = await response.json();
                if (users && users.length > 0) user = users[0];
            }
        }
        // display_name ilike
        if (!user) {
            url = `${SUPABASE_URL}/leaderboard_full?display_name=ilike.%${username}%`;
            response = await fetch(url, {
                headers: {
                    'apikey': SUPABASE_API_KEY,
                    'Authorization': `Bearer ${SUPABASE_API_KEY}`,
                    'Content-Type': 'application/json',
                }
            });
            if (response.ok) {
                users = await response.json();
                if (users && users.length > 0) user = users[0];
            }
        }
        // username ilike
        if (!user) {
            url = `${SUPABASE_URL}/leaderboard_full?username=ilike.%${username}%`;
            response = await fetch(url, {
                headers: {
                    'apikey': SUPABASE_API_KEY,
                    'Authorization': `Bearer ${SUPABASE_API_KEY}`,
                    'Content-Type': 'application/json',
                }
            });
            if (response.ok) {
                users = await response.json();
                if (users && users.length > 0) user = users[0];
            }
        }
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Mindshare için yaps_season_one
        const usernameOrDisplay = user.username || user.display_name;
        let mindshare_s1 = '-';
        let yapsUrl = `${SUPABASE_URL}/yaps_season_one?username=eq.${encodeURIComponent(usernameOrDisplay)}`;
        let yapsRes = await fetch(yapsUrl, {
            headers: {
                'apikey': SUPABASE_API_KEY,
                'Authorization': `Bearer ${SUPABASE_API_KEY}`,
                'Content-Type': 'application/json',
            }
        });
        let yapsData = yapsRes.ok ? await yapsRes.json() : [];
        if (!yapsData || yapsData.length === 0) {
            yapsUrl = `${SUPABASE_URL}/yaps_season_one?username=ilike.%25${usernameOrDisplay}%25`;
            yapsRes = await fetch(yapsUrl, {
                headers: {
                    'apikey': SUPABASE_API_KEY,
                    'Authorization': `Bearer ${SUPABASE_API_KEY}`,
                    'Content-Type': 'application/json',
                }
            });
            yapsData = yapsRes.ok ? await yapsRes.json() : [];
        }
        if (yapsData && yapsData.length > 0) {
            let found = yapsData.find(d => (d.username || '').toLowerCase() === usernameOrDisplay.toLowerCase());
            if (!found) found = yapsData[0];
            let mindshareVal = null;
            if (found && found.jsonInput) {
                try {
                    const json = typeof found.jsonInput === 'string' ? JSON.parse(found.jsonInput) : found.jsonInput;
                    if (json.mindshare !== undefined && json.mindshare !== null) {
                        mindshareVal = json.mindshare;
                    }
                } catch (e) {}
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
        // Mindshare için yaps_season_zero
        let mindshare_s0 = '-';
        let yapsZeroUrl = `${SUPABASE_URL}/yaps_season_zero?username=eq.${encodeURIComponent(usernameOrDisplay)}`;
        let yapsZeroRes = await fetch(yapsZeroUrl, {
            headers: {
                'apikey': SUPABASE_API_KEY,
                'Authorization': `Bearer ${SUPABASE_API_KEY}`,
                'Content-Type': 'application/json',
            }
        });
        let yapsZeroData = yapsZeroRes.ok ? await yapsZeroRes.json() : [];
        if (!yapsZeroData || yapsZeroData.length === 0) {
            yapsZeroUrl = `${SUPABASE_URL}/yaps_season_zero?username=ilike.%25${usernameOrDisplay}%25`;
            yapsZeroRes = await fetch(yapsZeroUrl, {
                headers: {
                    'apikey': SUPABASE_API_KEY,
                    'Authorization': `Bearer ${SUPABASE_API_KEY}`,
                    'Content-Type': 'application/json',
                }
            });
            yapsZeroData = yapsZeroRes.ok ? await yapsZeroRes.json() : [];
        }
        if (yapsZeroData && yapsZeroData.length > 0) {
            let found0 = yapsZeroData.find(d => (d.username || '').toLowerCase() === usernameOrDisplay.toLowerCase());
            if (!found0) found0 = yapsZeroData[0];
            let mindshareVal0 = null;
            if (found0 && found0.jsonInput) {
                try {
                    const json = typeof found0.jsonInput === 'string' ? JSON.parse(found0.jsonInput) : found0.jsonInput;
                    if (json.mindshare !== undefined && json.mindshare !== null) {
                        mindshareVal0 = json.mindshare;
                    }
                } catch (e) {}
            }
            if (typeof mindshareVal0 === 'string') {
                mindshareVal0 = mindshareVal0.replace('%', '').trim();
            }
            if (mindshareVal0 !== null && !isNaN(mindshareVal0)) {
                let num0 = parseFloat(mindshareVal0);
                if (num0 < 1) {
                    mindshare_s0 = (num0 * 100).toFixed(2);
                } else {
                    mindshare_s0 = num0.toFixed(2);
                }
            } else if (mindshareVal0 !== null) {
                let num0 = parseFloat(String(mindshareVal0).replace(',', '.'));
                if (!isNaN(num0)) {
                    if (num0 < 1) {
                        mindshare_s0 = (num0 * 100).toFixed(2);
                    } else {
                        mindshare_s0 = num0.toFixed(2);
                    }
                }
            }
        }
        // pfp, total_xp, level, title jsonInput içinden alınabilir
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
        res.json({
            username: usernameOrDisplay,
            total_xp,
            level,
            title,
            mindshare_s1,
            mindshare_s0,
            pfp
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
