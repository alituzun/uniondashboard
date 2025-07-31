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
            const response = await fetch(`/api/user/get-user-summary/${encodeURIComponent(username)}`);
            if (!response.ok) {
                let errMsg = 'Unknown error occurred.';
                try {
                    const err = await response.json();
                    if (err.message && err.message.toLowerCase().includes('bulunamadı')) {
                        errMsg = 'User not found.';
                    } else if (err.message && err.message.toLowerCase().includes('dosyası bulunamadı')) {
                        errMsg = 'Required data file is missing.';
                    } else if (err.message) {
                        errMsg = err.message;
                    }
                } catch {}
                resultDiv.innerHTML = `<span style='color:red'>${errMsg}</span>`;
                return;
            }
            const data = await response.json();
            let html = '';
            html += `<div style='margin-bottom:12px;padding:8px 12px;background:#333;border-radius:8px;'>`;
            html += `<div><b>Username:</b> ${username ?? '-'}</div>`;
            html += `<div><b>Total XP:</b> ${data.total_xp ?? '-'}</div>`;
            html += `<div><b>Level :</b> ${data.level ?? '-'}</div>`;
            html += `<div><b>Title :</b> ${data.title ?? '-'}</div>`;
            html += `<div><b>Mindshare s0:</b> ${data.mindshare_s0 ?? '-'}</div>`;
            html += `<div><b>Mindshare s1:</b> ${data.mindshare_s1 ?? '-'}</div>`;
            html += `</div>`;
            html += `<img src='${data.pfp}' alt='pfp' style='width:220px;height:220px;border-radius:16px;border:2px solid #2196f3;background:#fff;box-shadow:0 2px 16px #0006;margin-top:12px;'>`;
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