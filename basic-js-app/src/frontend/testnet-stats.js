// testnet-stats.js - Testnet istatistiklerini yükleyip grafikler oluşturur
(function(){
    // Hard-coded level stats data
    let levelStats = {
        "1": {
            "count": 67176,
            "totalXp": 816390
        },
        "2": {
            "count": 65127,
            "totalXp": 3634645
        },
        "3": {
            "count": 82993,
            "totalXp": 9763235
        },
        "4": {
            "count": 30599,
            "totalXp": 6931835
        },
        "5": {
            "count": 33754,
            "totalXp": 12880105
        },
        "6": {
            "count": 33277,
            "totalXp": 17539870
        },
        "7": {
            "count": 34387,
            "totalXp": 22788185
        },
        "8": {
            "count": 3551,
            "totalXp": 2974325
        },
        "9": {
            "count": 707,
            "totalXp": 717210
        },
        "10": {
            "count": 58,
            "totalXp": 71500
        }
    };
    
    let totalUsers = 0;
    let totalXp = 0;

    document.addEventListener('DOMContentLoaded', function () {
        loadTestnetStats();
    });

    async function loadTestnetStats() {
        try {
            // Toplam kullanıcı ve XP hesapla
            calculateTotals();
            
            // İçerikleri göster
            document.getElementById('loading').style.display = 'none';
            document.getElementById('content').style.display = 'block';
            
            // Stats kartlarını oluştur
            createStatsCards();
            
            // Grafikleri oluştur
            createCharts();
            
        } catch (error) {
            console.error('Error loading testnet stats:', error);
            showError(`Failed to load testnet statistics: ${error.message}`);
        }
    }

    function calculateTotals() {
        totalUsers = 0;
        totalXp = 0;
        
        for (const level in levelStats) {
            totalUsers += levelStats[level].count;
            totalXp += levelStats[level].totalXp;
        }
    }

    function createStatsCards() {
        const statsGrid = document.getElementById('stats-grid');
        
        // Toplam kullanıcı kartı
        const totalUsersCard = createStatCard('Total Users', formatNumber(totalUsers), 'Active testnet participants');
        statsGrid.appendChild(totalUsersCard);
        
        // Toplam XP kartı
        const totalXpCard = createStatCard('Total XP', formatNumber(totalXp), 'Combined experience points');
        statsGrid.appendChild(totalXpCard);
        
        // Ortalama XP kartı
        const avgXp = totalUsers > 0 ? Math.round(totalXp / totalUsers) : 0;
        const avgXpCard = createStatCard('Average XP', formatNumber(avgXp), 'XP per user');
        statsGrid.appendChild(avgXpCard);
        
        // En yüksek level
        const maxLevel = Math.max(...Object.keys(levelStats).map(Number));
        const maxLevelCard = createStatCard('Max Level', maxLevel, 'Highest achieved level');
        statsGrid.appendChild(maxLevelCard);
        
        // En popüler level
        const mostPopularLevel = Object.keys(levelStats).reduce((a, b) => 
            levelStats[a].count > levelStats[b].count ? a : b
        );
        const popularLevelCard = createStatCard('Most Popular Level', mostPopularLevel, 
            `${formatNumber(levelStats[mostPopularLevel].count)} users`);
        statsGrid.appendChild(popularLevelCard);
        
        // En yüksek XP toplamına sahip level
        const highestXpLevel = Object.keys(levelStats).reduce((a, b) => 
            levelStats[a].totalXp > levelStats[b].totalXp ? a : b
        );
        const highestXpCard = createStatCard('Highest XP Level', highestXpLevel, 
            `${formatNumber(levelStats[highestXpLevel].totalXp)} total XP`);
        statsGrid.appendChild(highestXpCard);
    }

    function createStatCard(title, value, subtitle) {
        const card = document.createElement('div');
        card.className = 'stat-card';
        
        card.innerHTML = `
            <h3>${title}</h3>
            <div class="stat-value">${value}</div>
            <div class="stat-label">${subtitle}</div>
        `;
        
        return card;
    }

    function createCharts() {
        createLevelDistributionChart();
        createXpDistributionChart();
        createAvgXpChart();
    }

    function createLevelDistributionChart() {
        const ctx = document.getElementById('levelDistributionChart').getContext('2d');
        
        const levels = Object.keys(levelStats).sort((a, b) => Number(a) - Number(b));
        const counts = levels.map(level => levelStats[level].count);
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: levels.map(l => `Level ${l}`),
                datasets: [{
                    label: 'Number of Users',
                    data: counts,
                    backgroundColor: levels.map((_, i) => `hsl(${200 + i * 15}, 70%, 60%)`),
                    borderColor: levels.map((_, i) => `hsl(${200 + i * 15}, 70%, 50%)`),
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#fff' }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Users: ${formatNumber(context.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        type: 'logarithmic',
                        beginAtZero: false,
                        min: 10,
                        max: 100000,
                        ticks: { 
                            color: '#aaa',
                            callback: function(value, index, values) {
                                // Tüm major tick'leri göster
                                if (value === 10 || value === 100 || value === 1000 || 
                                    value === 10000 || value === 100000) {
                                    return formatNumber(value);
                                }
                                // Gerçek veri değerlerini de göster
                                const actualCounts = [67176, 65127, 82993, 30599, 33754, 33277, 34387, 3551, 707, 58];
                                if (actualCounts.includes(value)) {
                                    return formatNumber(value);
                                }
                                return '';
                            }
                        },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    },
                    x: {
                        ticks: { color: '#aaa' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    }
                }
            }
        });
    }

    function createXpDistributionChart() {
        const ctx = document.getElementById('xpDistributionChart').getContext('2d');
        
        const levels = Object.keys(levelStats).sort((a, b) => Number(a) - Number(b));
        const totalXps = levels.map(level => levelStats[level].totalXp);
        
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: levels.map(l => `Level ${l}`),
                datasets: [{
                    label: 'Total XP',
                    data: totalXps,
                    borderColor: '#76ff03',
                    backgroundColor: 'rgba(118, 255, 3, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#76ff03',
                    pointBorderColor: '#fff',
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#fff' }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { 
                            color: '#aaa',
                            callback: function(value) {
                                return formatNumber(value);
                            }
                        },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    },
                    x: {
                        ticks: { color: '#aaa' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    }
                }
            }
        });
    }

    function createAvgXpChart() {
        const ctx = document.getElementById('avgXpChart').getContext('2d');
        
        const levels = Object.keys(levelStats).sort((a, b) => Number(a) - Number(b));
        const avgXps = levels.map(level => {
            const count = levelStats[level].count;
            const totalXp = levelStats[level].totalXp;
            return count > 0 ? Math.round(totalXp / count) : 0;
        });
        
        new Chart(ctx, {
            type: 'radar',
            data: {
                labels: levels.map(l => `Level ${l}`),
                datasets: [{
                    label: 'Average XP per User',
                    data: avgXps,
                    borderColor: '#ffb74d',
                    backgroundColor: 'rgba(255, 183, 77, 0.2)',
                    borderWidth: 2,
                    pointBackgroundColor: '#ffb74d',
                    pointBorderColor: '#fff',
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#fff' }
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        ticks: { 
                            color: '#aaa',
                            callback: function(value) {
                                return formatNumber(value);
                            }
                        },
                        grid: { color: 'rgba(255, 255, 255, 0.2)' },
                        angleLines: { color: 'rgba(255, 255, 255, 0.2)' },
                        pointLabels: { color: '#fff' }
                    }
                }
            }
        });
    }

    function formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toLocaleString();
    }

    function showError(message) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        document.getElementById('error-message').textContent = message;
    }
})();
