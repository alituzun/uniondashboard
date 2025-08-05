// reward-stats.js - Reward istatistiklerini gösterir
(function(){
    // Hardcoded reward statistics data
    const rewardStats = {
        "1": {
            "processedUsers": 66331,
            "roleCounts": {
                "OG": 109,
                "Fanatic": 18602,
                "Whale Shark role": 10
            }
        },
        "2": {
            "processedUsers": 64380,
            "roleCounts": {
                "OG": 285,
                "Fanatic": 19488,
                "Whale Shark role": 56
            }
        },
        "3": {
            "processedUsers": 82578,
            "roleCounts": {
                "OG": 1192,
                "Fanatic": 30577,
                "Whale Shark role": 173
            }
        },
        "4": {
            "processedUsers": 30438,
            "roleCounts": {
                "OG": 727,
                "Fanatic": 12357,
                "Whale Shark role": 247
            }
        },
        "5": {
            "processedUsers": 33741,
            "roleCounts": {
                "OG": 400,
                "Fanatic": 13725,
                "Whale Shark role": 206
            }
        },
        "6": {
            "processedUsers": 33350,
            "roleCounts": {
                "OG": 348,
                "Fanatic": 25565,
                "Whale Shark role": 277
            }
        },
        "7": {
            "processedUsers": 34379,
            "roleCounts": {
                "OG": 592,
                "Fanatic": 32977,
                "Whale Shark role": 370
            }
        },
        "8": {
            "processedUsers": 3562,
            "roleCounts": {
                "OG": 1251,
                "Fanatic": 3559,
                "Whale Shark role": 395
            }
        },
        "9": {
            "processedUsers": 712,
            "roleCounts": {
                "OG": 258,
                "Fanatic": 712,
                "Whale Shark role": 158
            }
        },
        "10": {
            "processedUsers": 60,
            "roleCounts": {
                "OG": 43,
                "Fanatic": 60,
                "Whale Shark role": 29
            }
        }
    };

    const totalStats = {
        "OG": 5205,
        "Fanatic": 157622,
        "Whale Shark role": 1921
    };

    document.addEventListener('DOMContentLoaded', function () {
        createLevelCards();
        createCharts();
    });

    function createLevelCards() {
        const levelGrid = document.getElementById('level-grid');
        
        Object.keys(rewardStats).sort((a, b) => Number(a) - Number(b)).forEach(level => {
            const levelData = rewardStats[level];
            const card = document.createElement('div');
            card.className = 'level-card';
            
            card.innerHTML = `
                <div class="level-header">Level ${level}</div>
                <div class="role-stats">
                    <div class="role-item">
                        <div class="role-name">OG</div>
                        <div class="role-count">${formatNumber(levelData.roleCounts.OG)}</div>
                    </div>
                    <div class="role-item">
                        <div class="role-name">Fanatic</div>
                        <div class="role-count">${formatNumber(levelData.roleCounts.Fanatic)}</div>
                    </div>
                    <div class="role-item">
                        <div class="role-name">Whale Shark</div>
                        <div class="role-count">${formatNumber(levelData.roleCounts["Whale Shark role"])}</div>
                    </div>
                </div>
            `;
            
            levelGrid.appendChild(card);
        });
    }

    function createCharts() {
        createOGChart();
        createWhaleSharkChart();
        createComparisonChart();
    }

    function createOGChart() {
        const ctx = document.getElementById('ogChart').getContext('2d');
        
        const levels = Object.keys(rewardStats).sort((a, b) => Number(a) - Number(b));
        const ogCounts = levels.map(level => rewardStats[level].roleCounts.OG);
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: levels.map(l => `Level ${l}`),
                datasets: [{
                    label: 'OG Role Holders',
                    data: ogCounts,
                    backgroundColor: 'rgba(76, 175, 80, 0.7)',
                    borderColor: 'rgba(76, 175, 80, 1)',
                    borderWidth: 2,
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
                                return `OG Holders: ${formatNumber(context.parsed.y)}`;
                            }
                        }
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

    function createWhaleSharkChart() {
        const ctx = document.getElementById('whaleSharkChart').getContext('2d');
        
        const levels = Object.keys(rewardStats).sort((a, b) => Number(a) - Number(b));
        const whaleSharkCounts = levels.map(level => rewardStats[level].roleCounts["Whale Shark role"]);
        
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: levels.map(l => `Level ${l}`),
                datasets: [{
                    label: 'Whale Shark Role Holders',
                    data: whaleSharkCounts,
                    backgroundColor: [
                        '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3',
                        '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39'
                    ],
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { 
                            color: '#fff',
                            padding: 20
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const level = context.label;
                                const value = context.parsed;
                                const total = whaleSharkCounts.reduce((sum, count) => sum + count, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return `${level}: ${formatNumber(value)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    function createComparisonChart() {
        const ctx = document.getElementById('comparisonChart').getContext('2d');
        
        const levels = Object.keys(rewardStats).sort((a, b) => Number(a) - Number(b));
        const ogCounts = levels.map(level => rewardStats[level].roleCounts.OG);
        const fanaticCounts = levels.map(level => rewardStats[level].roleCounts.Fanatic);
        const whaleSharkCounts = levels.map(level => rewardStats[level].roleCounts["Whale Shark role"]);
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: levels.map(l => `Level ${l}`),
                datasets: [
                    {
                        label: 'OG',
                        data: ogCounts,
                        backgroundColor: 'rgba(76, 175, 80, 0.8)',
                        borderColor: 'rgba(76, 175, 80, 1)',
                        borderWidth: 2,
                        yAxisID: 'y1'
                    },
                    {
                        label: 'Whale Shark',
                        data: whaleSharkCounts,
                        backgroundColor: 'rgba(33, 150, 243, 0.8)',
                        borderColor: 'rgba(33, 150, 243, 1)',
                        borderWidth: 2,
                        yAxisID: 'y1'
                    },
                    {
                        label: 'Fanatic',
                        data: fanaticCounts,
                        backgroundColor: 'rgba(255, 152, 0, 0.6)',
                        borderColor: 'rgba(255, 152, 0, 1)',
                        borderWidth: 2,
                        yAxisID: 'y2'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        labels: { 
                            color: '#fff',
                            padding: 20,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${formatNumber(context.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#aaa' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'OG & Whale Shark Count',
                            color: '#4fc3f7'
                        },
                        ticks: { 
                            color: '#76ff03',
                            callback: function(value) {
                                return formatNumber(value);
                            }
                        },
                        grid: { 
                            color: 'rgba(118, 255, 3, 0.1)',
                            drawOnChartArea: true
                        }
                    },
                    y2: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Fanatic Count',
                            color: '#ff9800'
                        },
                        ticks: { 
                            color: '#ff9800',
                            callback: function(value) {
                                return formatNumber(value);
                            }
                        },
                        grid: { 
                            color: 'rgba(255, 152, 0, 0.1)',
                            drawOnChartArea: false
                        }
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
})();
