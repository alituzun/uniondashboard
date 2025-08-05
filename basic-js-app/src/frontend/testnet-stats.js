// testnet-stats.js - Testnet istatistiklerini yükleyip grafikler oluşturur
(function(){
    // Updated level stats data with latest statistics from API calculation - August 2025
    let levelStats = {
        "1": {
            "count": 67596,
            "totalXp": 820255,
            "averageXp": 12
        },
        "2": {
            "count": 65348,
            "totalXp": 3650460,
            "averageXp": 56
        },
        "3": {
            "count": 83217,
            "totalXp": 9792985,
            "averageXp": 118
        },
        "4": {
            "count": 30658,
            "totalXp": 6940860,
            "averageXp": 226
        },
        "5": {
            "count": 33773,
            "totalXp": 12892920,
            "averageXp": 382
        },
        "6": {
            "count": 33361,
            "totalXp": 17582795,
            "averageXp": 527
        },
        "7": {
            "count": 34381,
            "totalXp": 22782550,
            "averageXp": 663
        },
        "8": {
            "count": 3563,
            "totalXp": 2982570,
            "averageXp": 837
        },
        "9": {
            "count": 712,
            "totalXp": 721410,
            "averageXp": 1013
        },
        "10": {
            "count": 62,
            "totalXp": 76145,
            "averageXp": 1228
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
        // Updated with latest API calculated data showing exact user distribution
        totalUsers = 352671;
        totalXp = 78242950;
    }

    function createStatsCards() {
        const statsGrid = document.getElementById('stats-grid');
        
        // Toplam kullanıcı kartı
        const totalUsersCard = createStatCard('Total Users', formatNumber(totalUsers), 'Active testnet participants');
        statsGrid.appendChild(totalUsersCard);
        
        // Toplam XP kartı
        const totalXpCard = createStatCard('Total XP', formatNumber(totalXp), 'Combined experience points');
        statsGrid.appendChild(totalXpCard);
        
        // Ortalama XP kartı (use calculated average from API: 222)
        const avgXp = 222;
        const avgXpCard = createStatCard('Average XP', formatNumber(avgXp), 'XP per user overall');
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
                                const actualCounts = [67388, 65243, 83142, 30626, 33757, 33350, 34379, 3562, 712, 60];
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
        const avgXps = levels.map(level => levelStats[level].averageXp);
        
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
