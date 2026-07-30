// ==========================================
// QUESTS TRACKING FUNC
// ==========================================
function checkQuests(type, val, targetType = null) {
    if (!gameState) return;

    if (type === 'kill_zombie') {
        gameState.questProgress.zombiesKilled += val;
    }
    if (type === 'collect_scrap') {
        gameState.questProgress.scrapCollected = (gameState.questProgress.scrapCollected || 0) + val;
    }
    if (type === 'collect_data') {
        gameState.questProgress.dataCollected = (gameState.questProgress.dataCollected || 0) + val;
    }

    // Check all quests
    gameState.allQuests.forEach(q => {
        if (gameState.completedQuests.includes(q.id)) return;

        let completed = false;

        if (q.type === 'kill_zombie' && gameState.questProgress.zombiesKilled >= q.target) completed = true;
        if (q.type === 'build_module' && q.targetId === targetType && gameState.modules[q.targetId].level >= q.targetLvl) completed = true;
        if (q.type === 'survive_wave' && type === 'survive_wave' && val >= q.target) completed = true;
        if (q.type === 'reach_wave' && type === 'reach_wave' && val >= q.target) completed = true;
        if (q.type === 'hire_merc' && type === 'hire_merc' && targetType === q.targetType) completed = true;
        if (q.type === 'squad_size' && gameState.squad.length >= q.target) completed = true;
        if (q.type === 'collect_scrap' && (gameState.questProgress.scrapCollected || 0) >= q.target) completed = true;
        if (q.type === 'collect_data' && (gameState.questProgress.dataCollected || 0) >= q.target) completed = true;

        // Modules all max
        if (q.type === 'all_max') {
            let allMax = true;
            for (const key in gameState.modules) {
                if (gameState.modules[key].level < gameState.modules[key].maxLevel) allMax = false;
            }
            if (allMax) completed = true;
        }

        if (completed) {
            gameState.completedQuests.push(q.id);
            gameState.resources.scrap = Math.min(gameState.resources.scrapMax, gameState.resources.scrap + q.reward.scrap);
            gameState.resources.data += q.reward.data;
            ui.showNotification(`Квест Выполнен: ${q.title}!`, 'info');
            ui.updateAll();
        }
    });

    if (ui.renderQuests) ui.renderQuests();
}

// ==========================================
// AUDIO SYSTEM
// ==========================================
const AUDIO_PATHS = {
    bgMusic: 'music.mp3',
    shoot: 'shoot.wav',
    zombieDeath: 'death.wav',
    click: 'click.wav',
    error: 'error.wav'
};

const audioManager = {
    muted: true, // Start muted to comply with browser autoplay policies
    bgm: null,
    sfxPool: {},

    init() {
        this.bgm = new Audio(AUDIO_PATHS.bgMusic);
        this.bgm.loop = true;
        this.bgm.volume = 0.3;

        ['shoot', 'zombieDeath', 'click', 'error'].forEach(key => {
            this.sfxPool[key] = [];
            for (let i = 0; i < 5; i++) { // Pool of 5 audios per sound
                const a = new Audio(AUDIO_PATHS[key]);
                a.volume = 0.4;
                this.sfxPool[key].push(a);
            }
        });
    },

    toggleMute() {
        this.muted = !this.muted;
        if (!this.muted) {
            this.bgm.play().catch(() => {});
        } else {
            this.bgm.pause();
        }
        document.getElementById('mute-btn').innerText = this.muted ? '🔇' : '🔊';
    },

    playSfx(key) {
        if (this.muted) return;
        const pool = this.sfxPool[key];
        if (pool) {
            const audio = pool.find(a => a.paused || a.ended);
            if (audio) {
                audio.currentTime = 0;
                audio.play().catch(() => {});
            }
        }
    }
};

// ==========================================
// GLOBALS & CONSTANTS
// ==========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameWidth = 0;
let gameHeight = 0;
let lastTime = 0;
let gameState = null; // Will hold the core game state instance

// ==========================================
// BASIC CLASS STRUCTURES
// ==========================================

class GameState {
    constructor() {
        this.resources = {
            scrap: 0,
            scrapMax: 500,
            data: 0,
            energy: 0,
            barricade: 100,
            barricadeMax: 100
        };
        this.wave = 1;
        this.waveInProgress = false;
        this.autoWaveTimer = 0;

        this.modules = {
            generator: { level: 0, maxLevel: 5, name: 'Генератор', desc: 'Дает Энергию.', cost: 50 },
            workbench: { level: 0, maxLevel: 5, name: 'Верстак', desc: '+15% урон солдат.', cost: 100 },
            kitchen: { level: 0, maxLevel: 5, name: 'Пищеблок', desc: '+20% макс HP солдат.', cost: 150 },
            recreation: { level: 0, maxLevel: 5, name: 'Зона отдыха', desc: '+10% скорость стрельбы.', cost: 200 },
            storage: { level: 0, maxLevel: 5, name: 'Склад', desc: 'Увеличивает лимит Хлама и прочность баррикады.', cost: 50 }
        };
        this.squad = [];
        this.quests = []; // To be populated
        this.completedQuests = [];
        this.questProgress = {
            zombiesKilled: 0
        };

        // 30+ Quests definition
        this.allQuests = [
            { id: 'q1', type: 'kill_zombie', target: 10, title: 'Первая кровь', desc: 'Убить 10 зомби.', reward: { scrap: 50, data: 0 } },
            { id: 'q2', type: 'kill_zombie', target: 50, title: 'Очистка территории', desc: 'Убить 50 зомби.', reward: { scrap: 100, data: 2 } },
            { id: 'q3', type: 'kill_zombie', target: 100, title: 'Истребитель', desc: 'Убить 100 зомби.', reward: { scrap: 200, data: 5 } },
            { id: 'q4', type: 'kill_zombie', target: 500, title: 'Мясник', desc: 'Убить 500 зомби.', reward: { scrap: 500, data: 10 } },
            { id: 'q5', type: 'kill_zombie', target: 1000, title: 'Легенда Пустошей', desc: 'Убить 1000 зомби.', reward: { scrap: 1000, data: 20 } },

            { id: 'q6', type: 'build_module', targetId: 'generator', targetLvl: 1, title: 'Да будет свет', desc: 'Построить Генератор 1 уровня.', reward: { scrap: 30, data: 1 } },
            { id: 'q7', type: 'build_module', targetId: 'generator', targetLvl: 3, title: 'Энергокризис отменяется', desc: 'Генератор 3 уровня.', reward: { scrap: 100, data: 3 } },
            { id: 'q8', type: 'build_module', targetId: 'generator', targetLvl: 5, title: 'Бесконечная Энергия', desc: 'Максимальный Генератор.', reward: { scrap: 300, data: 5 } },

            { id: 'q9', type: 'build_module', targetId: 'workbench', targetLvl: 1, title: 'Первые пушки', desc: 'Построить Верстак.', reward: { scrap: 50, data: 1 } },
            { id: 'q10', type: 'build_module', targetId: 'workbench', targetLvl: 5, title: 'Оружейный Барон', desc: 'Верстак 5 уровня.', reward: { scrap: 400, data: 5 } },

            { id: 'q11', type: 'build_module', targetId: 'kitchen', targetLvl: 1, title: 'Пора кушать', desc: 'Построить Пищеблок.', reward: { scrap: 60, data: 1 } },
            { id: 'q12', type: 'build_module', targetId: 'kitchen', targetLvl: 5, title: 'Шеф-повар', desc: 'Пищеблок 5 уровня.', reward: { scrap: 400, data: 5 } },

            { id: 'q13', type: 'build_module', targetId: 'recreation', targetLvl: 1, title: 'Перекур', desc: 'Зона отдыха 1 уровня.', reward: { scrap: 80, data: 1 } },
            { id: 'q14', type: 'build_module', targetId: 'recreation', targetLvl: 5, title: 'Рай в Аду', desc: 'Зона отдыха 5 уровня.', reward: { scrap: 500, data: 5 } },

            { id: 'q15', type: 'build_module', targetId: 'storage', targetLvl: 1, title: 'Плюшкин', desc: 'Построить Склад.', reward: { scrap: 50, data: 1 } },
            { id: 'q16', type: 'build_module', targetId: 'storage', targetLvl: 5, title: 'Скрудж', desc: 'Склад 5 уровня.', reward: { scrap: 300, data: 5 } },

            { id: 'q17', type: 'survive_wave', target: 5, title: 'Разминка', desc: 'Пережить 5 волну.', reward: { scrap: 100, data: 2 } },
            { id: 'q18', type: 'survive_wave', target: 10, title: 'Крепкий орешек', desc: 'Пережить 10 волну.', reward: { scrap: 200, data: 5 } },
            { id: 'q19', type: 'survive_wave', target: 15, title: 'Железный Человек', desc: 'Пережить 15 волну.', reward: { scrap: 300, data: 8 } },
            { id: 'q20', type: 'survive_wave', target: 20, title: 'Неуязвимый', desc: 'Пережить 20 волну.', reward: { scrap: 500, data: 10 } },
            { id: 'q21', type: 'survive_wave', target: 30, title: 'Ветеран', desc: 'Пережить 30 волну.', reward: { scrap: 1000, data: 20 } },
            { id: 'q22', type: 'survive_wave', target: 50, title: 'Бессмертный', desc: 'Пережить 50 волну.', reward: { scrap: 2000, data: 50 } },

            { id: 'q23', type: 'hire_merc', targetType: 'Новобранец', title: 'Пушечное мясо', desc: 'Нанять Новобранца.', reward: { scrap: 25, data: 0 } },
            { id: 'q24', type: 'hire_merc', targetType: 'Штурмовик', title: 'Огневая мощь', desc: 'Нанять Штурмовика.', reward: { scrap: 75, data: 1 } },
            { id: 'q25', type: 'hire_merc', targetType: 'Снайпер', title: 'Один выстрел', desc: 'Нанять Снайпера.', reward: { scrap: 125, data: 2 } },

            { id: 'q26', type: 'squad_size', target: 5, title: 'Полный отряд', desc: 'Собрать отряд из 5 человек.', reward: { scrap: 200, data: 5 } },

            { id: 'q27', type: 'reach_wave', target: 5, title: 'Начало конца', desc: 'Дойти до 5 волны.', reward: { scrap: 50, data: 1 } },
            { id: 'q28', type: 'reach_wave', target: 10, title: 'Первый Босс', desc: 'Дойти до 10 волны.', reward: { scrap: 100, data: 2 } },

            { id: 'q29', type: 'collect_scrap', target: 1000, title: 'Собиратель', desc: 'Накопить 1000 Хлама за всё время (награда: 10 Данных).', reward: { scrap: 0, data: 10 } },
            { id: 'q30', type: 'collect_data', target: 50, title: 'Хакер', desc: 'Накопить 50 Данных за всё время.', reward: { scrap: 500, data: 0 } },

            { id: 'q31', type: 'all_max', target: 1, title: 'Убежище Мечты', desc: 'Прокачать все модули на Максимум.', reward: { scrap: 5000, data: 100 } }
        ];

        this.entities = {
            zombies: [],
            bullets: [],
            floatingTexts: [],
            particles: []
        };
    }

    save() {
        const saveData = {
            resources: this.resources,
            wave: this.wave,
            modules: this.modules,
            squad: this.squad.map(s => ({ type: s.type, hp: s.hp, maxHp: s.maxHp })),
            completedQuests: this.completedQuests,
            questProgress: this.questProgress
        };
        localStorage.setItem('revotick_save', JSON.stringify(saveData));
    }

    load() {
        const saved = localStorage.getItem('revotick_save');
        if (saved) {
            const data = JSON.parse(saved);
            this.resources = data.resources;
            this.wave = data.wave;
            this.modules = data.modules;
            this.completedQuests = data.completedQuests || [];
            this.questProgress = data.questProgress || { zombiesKilled: 0 };

            // Re-instantiate soldiers
            this.squad = data.squad.map((s, index) => {
                const soldier = new Soldier(s.type, 50, gameHeight - 150 - (index * 40));
                soldier.hp = s.hp;
                soldier.maxHp = s.maxHp;
                return soldier;
            });
            this.applyModuleEffects();
        }
    }

    applyModuleEffects() {
        // Recalculate max scrap and barricade from Storage
        this.resources.scrapMax = 500 + (this.modules.storage.level * 500);
        this.resources.barricadeMax = 100 + (this.modules.storage.level * 50);
        // Energy from Generator
        this.resources.energy = this.modules.generator.level * 10;

        // Soldier buffs are applied on creation or when they shoot based on module level
        // But maxHp from Kitchen applies immediately to current squad
        const hpMultiplier = 1 + (this.modules.kitchen.level * 0.20);
        this.squad.forEach(s => {
            const baseHp = s.type === 'Новобранец' ? 100 : (s.type === 'Штурмовик' ? 120 : 80);
            s.maxHp = baseHp * hpMultiplier;
            if (s.hp > s.maxHp) s.hp = s.maxHp;
        });
    }

    upgradeModule(moduleId) {
        const mod = this.modules[moduleId];
        if (mod && mod.level < mod.maxLevel && this.resources.scrap >= mod.cost) {
            // Check energy requirement (except for generator)
            if (moduleId !== 'generator' && this.resources.energy < (mod.level + 1) * 5) {
                ui.showNotification("Не хватает Энергии!", "error");
                audioManager.playSfx('error');
                return;
            }
            audioManager.playSfx('click');
            this.resources.scrap -= mod.cost;
            mod.level++;
            mod.cost = Math.floor(mod.cost * 1.5);
            this.applyModuleEffects();
            this.save();
            ui.updateAll();
            ui.showNotification(`Модуль ${mod.name} улучшен до ур. ${mod.level}`);
            checkQuests('build_module', mod.level, moduleId);
            checkQuests('all_max');
        } else {
            ui.showNotification("Недостаточно хлама или макс уровень!", "error");
            audioManager.playSfx('error');
        }
    }

    update(dt) {
        if (this.waveInProgress) {
            // Update bullets
            this.entities.bullets.forEach(b => b.update(dt));

            // Update zombies
            this.entities.zombies.forEach(z => z.update(dt));

            // Update soldiers (shooting logic)
            this.squad.forEach(s => s.update(dt, this.entities.zombies));

            // Handle Barricade and Soldier damage by zombies
            this.entities.zombies.forEach(z => {
                if (z.x <= 140 && z.attackTimer <= 0) {
                    if (this.resources.barricade > 0) {
                        this.resources.barricade -= z.damage;
                        ui.updateResources();

                        // Barricade Splinters
                        for (let p = 0; p < 5; p++) {
                            const vx = (Math.random() - 0.5) * 200;
                            const vy = -Math.random() * 150 - 50;
                            this.entities.particles.push(new Particle(140, gameHeight - 60 - Math.random() * 60, '#8d6e63', 3, vx, vy, 500));
                        }
                    } else {
                        // Damage random soldier
                        if (this.squad.length > 0) {
                            const target = this.squad[Math.floor(Math.random() * this.squad.length)];
                            target.hp -= z.damage;
                            this.addFloatingText(`-${z.damage}`, target.x, target.y - 20, '#ff3333');
                        }
                    }
                    z.attackTimer = 1000; // 1 hit per sec
                }
            });

            // Clean up dead entities
            this.entities.bullets = this.entities.bullets.filter(b => b.active);

            // Handle Zombie Deaths
            for (let i = this.entities.zombies.length - 1; i >= 0; i--) {
                const z = this.entities.zombies[i];
                if (z.hp <= 0) {
                    this.resources.scrap = Math.min(this.resources.scrapMax, this.resources.scrap + z.scrapReward);
                    checkQuests('collect_scrap', z.scrapReward);

                    if (Math.random() < 0.2) {
                        this.resources.data += 1;
                        checkQuests('collect_data', 1);
                    }

                    // Death Particles
                    for (let p = 0; p < 15; p++) {
                        const vx = (Math.random() - 0.5) * 400;
                        const vy = -Math.random() * 300 - 100;
                        const size = Math.random() * 4 + 2;
                        const color = z.type.includes('Дрон') ? '#555' : '#B71C1C';
                        this.entities.particles.push(new Particle(z.x, z.y - 15, color, size, vx, vy, 1000 + Math.random() * 1000));
                    }

                    audioManager.playSfx('zombieDeath');
                    this.entities.zombies.splice(i, 1);
                    ui.updateResources();
                    checkQuests('kill_zombie', 1);
                }
            }

            // Handle Soldier Deaths (Permadeath)
            for (let i = this.squad.length - 1; i >= 0; i--) {
                if (this.squad[i].hp <= 0) {
                    ui.showNotification(`Боец ${this.squad[i].type} погиб!`, "error");
                    this.squad.splice(i, 1);
                    ui.renderSquad();
                }
            }

            // Check game over
            if (this.squad.length === 0 && this.resources.barricade <= 0) {
                this.waveInProgress = false;
                document.getElementById('game-over-screen').classList.remove('hidden');
            }

            // Check wave clear
            if (this.entities.zombies.length === 0 && this.waveEnemiesSpawned >= this.waveEnemiesTotal) {
                this.endWave();
            }

            // Spawn logic
            if (this.waveEnemiesSpawned < this.waveEnemiesTotal && this.spawnTimer <= 0) {
                this.spawnZombie();
                this.spawnTimer = Math.max(500, 2000 - (this.wave * 100)); // Spawns get faster
            } else {
                this.spawnTimer -= dt;
            }
        }

        // Update floating texts
        this.entities.floatingTexts.forEach(ft => ft.update(dt));
        this.entities.floatingTexts = this.entities.floatingTexts.filter(ft => ft.active);

        // Update particles
        this.entities.particles.forEach(p => p.update(dt));
        this.entities.particles = this.entities.particles.filter(p => p.active);

        // Handle auto-wave countdown
        if (!this.waveInProgress && this.autoWaveTimer > 0) {
            const oldTimer = Math.ceil(this.autoWaveTimer / 1000);
            this.autoWaveTimer -= dt;
            const newTimer = Math.ceil(this.autoWaveTimer / 1000);

            if (oldTimer !== newTimer && newTimer > 0) {
                this.addFloatingText(`${newTimer}...`, gameWidth / 2, gameHeight / 2, '#ffb300', 800);
            }

            if (this.autoWaveTimer <= 0) {
                this.startWave();
            }
        }
    }

    dismissMerc(index) {
        if (index < 0 || index >= this.squad.length) return;

        const soldier = this.squad[index];
        let baseCost = 0;
        if (soldier.type === 'Новобранец') baseCost = 50;
        else if (soldier.type === 'Штурмовик') baseCost = 150;
        else if (soldier.type === 'Снайпер') baseCost = 250;

        const refund = Math.floor((baseCost * (1 - (this.modules.recreation.level * 0.05))) / 2);

        this.resources.scrap = Math.min(this.resources.scrapMax, this.resources.scrap + refund);

        // Teleport/dissolve particles
        for (let p = 0; p < 20; p++) {
            const vx = (Math.random() - 0.5) * 200;
            const vy = -Math.random() * 200 - 50;
            const size = Math.random() * 4 + 2;
            this.entities.particles.push(new Particle(soldier.x, soldier.y - 15, '#00f3ff', size, vx, vy, 800 + Math.random() * 500));
        }

        this.squad.splice(index, 1);

        // Reposition remaining squad
        this.squad.forEach((s, i) => {
            s.y = gameHeight - 150 - (i * 40);
        });

        this.save();
        ui.updateAll();
        audioManager.playSfx('click');
        ui.showNotification(`Боец уволен. Возвращено ${refund} ⚙️`, "info");
    }

    hireMerc(type) {
        if (this.squad.length >= 5) {
            ui.showNotification("Отряд полон!", "error");
            audioManager.playSfx('error');
            return;
        }

        let cost, maxHp, damage, fireRate, color;
        // Cost reduction from Recreation module
        const costMod = 1 - (this.modules.recreation.level * 0.05);

        if (type === 'Новобранец') { cost = Math.floor(50 * costMod); maxHp = 100; }
        else if (type === 'Штурмовик') { cost = Math.floor(150 * costMod); maxHp = 120; }
        else if (type === 'Снайпер') { cost = Math.floor(250 * costMod); maxHp = 80; }

        if (this.resources.scrap >= cost) {
            this.resources.scrap -= cost;
            const newSoldier = new Soldier(type, 50, gameHeight - 150 - (this.squad.length * 40));

            // Apply Kitchen HP buff
            const hpMultiplier = 1 + (this.modules.kitchen.level * 0.20);
            newSoldier.maxHp = maxHp * hpMultiplier;
            newSoldier.hp = newSoldier.maxHp;

            this.squad.push(newSoldier);
            this.save();
            ui.updateAll();
            ui.renderSquad();
            ui.showNotification(`${type} нанят!`);
            audioManager.playSfx('click');
            checkQuests('hire_merc', 1, type);
            checkQuests('squad_size', this.squad.length);
        } else {
            ui.showNotification("Недостаточно хлама!", "error");
            audioManager.playSfx('error');
        }
    }

    draw(ctx) {
        // Procedural Parallax Background

        // Base Sky
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, gameWidth, gameHeight);

        // Acid Fog / Toxic Atmosphere (Procedural)
        const timeOffset = Date.now() / 2000;
        for (let f = 0; f < 10; f++) {
            const fx = (Math.sin(timeOffset + f) * 200 + (f * gameWidth/10)) % gameWidth;
            const fy = gameHeight - 150 + Math.cos(timeOffset * 0.5 + f) * 50;

            const gradient = ctx.createRadialGradient(fx, fy, 0, fx, fy, 150);
            gradient.addColorStop(0, 'rgba(139, 195, 74, 0.05)'); // subtle acid green
            gradient.addColorStop(1, 'rgba(139, 195, 74, 0)');

            ctx.fillStyle = gradient;
            ctx.fillRect(fx - 150, fy - 150, 300, 300);
        }

        // Far Layer: City Skyline
        ctx.fillStyle = '#111111';
        // Random deterministic seed based on width so it stays static per resize
        let seed = 12345;
        function random() {
            let x = Math.sin(seed++) * 10000;
            return x - Math.floor(x);
        }

        // Draw buildings
        let bx = 0;
        while(bx < gameWidth) {
            let bw = 30 + random() * 50;
            let bh = 150 + random() * 150;
            ctx.fillRect(bx, gameHeight - 30 - bh, bw, bh);
            bx += bw + (random() * 20);
        }

        // Mid Layer: Trash Piles
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.moveTo(0, gameHeight - 30);
        let px = 0;
        seed = 54321;
        while (px <= gameWidth) {
            let step = 40 + random() * 60;
            let height = 30 + random() * 60;
            px += step;
            ctx.lineTo(px, gameHeight - 30 - height);
        }
        ctx.lineTo(gameWidth, gameHeight - 30);
        ctx.lineTo(0, gameHeight - 30);
        ctx.fill();

        // Ground (Near layer)
        ctx.fillStyle = '#222';
        ctx.fillRect(0, gameHeight - 30, gameWidth, 30);

        // Draw barricade
        if (this.resources.barricade > 0) {
            ctx.fillStyle = '#4a4a4a';
            ctx.fillRect(100, gameHeight - 150, 40, 120);
            // Barricade HP bar
            ctx.fillStyle = '#ff3333';
            ctx.fillRect(100, gameHeight - 160, 40, 5);
            ctx.fillStyle = '#4caf50';
            ctx.fillRect(100, gameHeight - 160, 40 * (this.resources.barricade / this.resources.barricadeMax), 5);
        } else {
            // Destroyed barricade
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(100, gameHeight - 60, 40, 30);
        }

        // Draw entities
        this.entities.particles.forEach(p => p.draw(ctx));
        this.squad.forEach(s => s.draw(ctx));
        this.entities.zombies.forEach(z => z.draw(ctx));
        this.entities.bullets.forEach(b => b.draw(ctx));
        this.entities.floatingTexts.forEach(ft => ft.draw(ctx));
    }

    startWave() {
        if (this.waveInProgress || (this.squad.length === 0 && this.resources.barricade <= 0)) return;
        this.waveInProgress = true;
        this.autoWaveTimer = 0; // Clear timer if manually started
        this.waveEnemiesTotal = 5 + (this.wave * 3);
        this.waveEnemiesSpawned = 0;
        this.spawnTimer = 1000;
        document.getElementById('next-wave-btn').disabled = true;
        ui.showNotification(`Волна ${this.wave} началась!`);
        checkQuests('reach_wave', this.wave);
    }

    endWave() {
        this.waveInProgress = false;
        this.wave++;

        // Heal soldiers based on kitchen
        const healPercent = 0.1 + (this.modules.kitchen.level * 0.05);
        this.squad.forEach(s => {
            s.hp = Math.min(s.maxHp, s.hp + (s.maxHp * healPercent));
        });

        this.save();
        ui.updateAll();
        ui.renderSquad();
        document.getElementById('next-wave-btn').disabled = false;
        ui.showNotification("Волна отбита! Отряд подлечился.", "info");
        checkQuests('survive_wave', this.wave - 1);

        // Auto-wave trigger
        if (document.getElementById('auto-wave-checkbox').checked && this.squad.length > 0) {
            this.autoWaveTimer = 3000;
            document.getElementById('next-wave-btn').disabled = true;
            this.addFloatingText("Следующая волна через 3...", gameWidth / 2 - 100, gameHeight / 2, '#ffb300', 800);
        }
    }

    spawnZombie() {
        const types = ['Ходячий'];
        if (this.wave >= 3) types.push('Бегун');
        if (this.wave >= 5) types.push('Бегун', 'Бегун');
        if (this.wave >= 10 && this.waveEnemiesSpawned === this.waveEnemiesTotal - 1) types.push('Гнилой Танк'); // Boss

        const type = types[Math.floor(Math.random() * types.length)];
        // Random Y position within some bounds to avoid straight line
        const yOffset = Math.random() * 40 - 20;
        const zombie = new Zombie(type, gameWidth, gameHeight - 60 + yOffset, this.wave);
        this.entities.zombies.push(zombie);
        this.waveEnemiesSpawned++;
    }

    addFloatingText(text, x, y, color, life = 800) {
        const ft = new FloatingText(text, x, y, color);
        ft.life = life;
        ft.maxLife = life;
        this.entities.floatingTexts.push(ft);
    }
}

class Soldier {
    constructor(type, x, y) {
        this.type = type;
        this.x = x;
        this.y = y;

        if (type === 'Новобранец') {
            this.maxHp = 100; this.damage = 15; this.fireRate = 1200; this.color = '#4CAF50';
        } else if (type === 'Штурмовик') {
            this.maxHp = 120; this.damage = 10; this.fireRate = 400; this.color = '#2196F3';
        } else if (type === 'Снайпер') {
            this.maxHp = 80; this.damage = 100; this.fireRate = 3000; this.color = '#9C27B0';
        }

        this.hp = this.maxHp;
        this.lastShot = 0;
        this.muzzleTimer = 0;
    }

    update(dt, zombies) {
        this.lastShot -= dt;
        if (this.muzzleTimer > 0) this.muzzleTimer -= dt;

        if (this.lastShot <= 0 && zombies.length > 0) {
            // Find closest zombie
            let target = zombies[0];
            let minDist = target.x;
            for (let i=1; i<zombies.length; i++) {
                if (zombies[i].x < minDist) {
                    minDist = zombies[i].x;
                    target = zombies[i];
                }
            }

            // Shoot
            // Apply buffs
            const dmgBuff = 1 + (gameState.modules.workbench.level * 0.15);
            const rateBuff = 1 - (gameState.modules.recreation.level * 0.10);

            gameState.entities.bullets.push(new Bullet(this.x + 10, this.y - 10, target, this.damage * dmgBuff));

            // Bullet shells particles
            const shellVx = -Math.random() * 50 - 50;
            const shellVy = -Math.random() * 100 - 50;
            gameState.entities.particles.push(new Particle(this.x + 5, this.y - 15, '#FFD700', 2, shellVx, shellVy, 800));

            this.lastShot = this.fireRate * Math.max(0.2, rateBuff);
            this.muzzleTimer = 50; // 50ms muzzle flash

            audioManager.playSfx('shoot');
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        // Body
        ctx.fillRect(this.x - 10, this.y - 20, 20, 30);
        // Head
        ctx.beginPath();
        ctx.arc(this.x, this.y - 25, 8, 0, Math.PI * 2);
        ctx.fill();

        // Gun
        ctx.fillStyle = '#fff';
        ctx.fillRect(this.x, this.y - 15, 15, 4);

        // Muzzle Flash
        if (this.muzzleTimer > 0) {
            ctx.fillStyle = '#ffb300';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ffb300';
            ctx.beginPath();
            ctx.arc(this.x + 18, this.y - 13, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }
}

class Zombie {
    constructor(type, x, y, wave) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.attackTimer = 0;

        const scale = 1 + (wave * 0.1); // Zombies get stronger with waves

        if (type === 'Ходячий') {
            this.maxHp = 50 * scale; this.speed = 30; this.damage = 5; this.scrapReward = 5; this.color = '#795548'; this.size = 1;
        } else if (type === 'Бегун') {
            this.maxHp = 30 * scale; this.speed = 70; this.damage = 3; this.scrapReward = 8; this.color = '#FF9800'; this.size = 0.8;
        } else if (type === 'Гнилой Танк') {
            this.maxHp = 300 * scale; this.speed = 15; this.damage = 25; this.scrapReward = 50; this.color = '#B71C1C'; this.size = 1.8;
        }
        this.hp = this.maxHp;
        this.hitFlashTimer = 0;
    }

    update(dt) {
        if (this.attackTimer > 0) this.attackTimer -= dt;
        if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt;

        // Move if not at barricade
        if (this.x > 140 || (gameState.resources.barricade <= 0 && this.x > 50)) {
            this.x -= this.speed * (dt / 1000);
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.hitFlashTimer > 0 ? '#ffffff' : this.color;
        const w = 20 * this.size;
        const h = 30 * this.size;

        // Body
        ctx.fillRect(this.x - w/2, this.y - h, w, h);
        // Head
        ctx.beginPath();
        ctx.arc(this.x, this.y - h - (5*this.size), 8*this.size, 0, Math.PI * 2);
        ctx.fill();

        // Glowing Eyes
        ctx.fillStyle = 'red';
        ctx.shadowBlur = 5;
        ctx.shadowColor = 'red';
        ctx.fillRect(this.x - 4*this.size, this.y - h - 6*this.size, 2*this.size, 2*this.size);
        ctx.fillRect(this.x, this.y - h - 6*this.size, 2*this.size, 2*this.size);
        ctx.shadowBlur = 0;

        // HP Bar
        ctx.fillStyle = '#ff3333';
        ctx.fillRect(this.x - w/2, this.y - h - 20, w, 4);
        ctx.fillStyle = '#4caf50';
        ctx.fillRect(this.x - w/2, this.y - h - 20, w * (this.hp / this.maxHp), 4);
    }
}

class Bullet {
    constructor(x, y, target, damage) {
        this.x = x;
        this.y = y;
        this.target = target;
        this.damage = damage;
        this.speed = 800; // pixels per sec
        this.active = true;
    }

    update(dt) {
        if (!this.active || !this.target || this.target.hp <= 0) {
            this.active = false;
            return;
        }

        const dx = this.target.x - this.x;
        const dy = (this.target.y - 15) - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 10) {
            // Hit
            this.target.hp -= this.damage;
            this.target.hitFlashTimer = 50; // 50ms hit flash
            gameState.addFloatingText(`${Math.floor(this.damage)}`, this.target.x, this.target.y - 40, '#ffb300');
            this.active = false;
        } else {
            // Move
            const moveAmt = this.speed * (dt / 1000);
            this.x += (dx / dist) * moveAmt;
            this.y += (dy / dist) * moveAmt;
        }
    }

    draw(ctx) {
        ctx.shadowBlur = 10;

        // Special color for high damage (sniper)
        if (this.damage > 50) {
            ctx.fillStyle = '#ff3333';
            ctx.shadowColor = '#ff3333';
            ctx.strokeStyle = 'rgba(255, 51, 51, 0.8)';
        } else {
            ctx.fillStyle = '#00f3ff';
            ctx.shadowColor = '#00f3ff';
            ctx.strokeStyle = 'rgba(0, 243, 255, 0.8)';
        }

        ctx.beginPath();
        ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
        ctx.fill();

        // Tracer
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - 15, this.y);
        ctx.stroke();

        ctx.shadowBlur = 0;
    }
}

class Particle {
    constructor(x, y, color, size, vx, vy, life) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = size;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.maxLife = life;
        this.active = true;
        this.gravity = 800; // pixels per sec^2
        this.floorY = gameHeight - 30;
    }

    update(dt) {
        if (!this.active) return;

        const dtSec = dt / 1000;

        this.vy += this.gravity * dtSec;
        this.x += this.vx * dtSec;
        this.y += this.vy * dtSec;

        // Floor collision
        if (this.y >= this.floorY) {
            this.y = this.floorY;
            this.vy = -this.vy * 0.4; // Bounce
            this.vx *= 0.8; // Friction
        }

        this.life -= dt;
        if (this.life <= 0) this.active = false;
    }

    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.globalAlpha = 1.0;
    }
}

class FloatingText {
    constructor(text, x, y, color) {
        this.text = text;
        this.x = x;
        this.y = y;
        this.color = color;
        this.life = 800; // ms
        this.maxLife = 800;
        this.active = true;
    }

    update(dt) {
        this.life -= dt;
        this.y -= 20 * (dt / 1000); // Float up
        if (this.life <= 0) this.active = false;
    }

    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillStyle = this.color;
        ctx.font = '14px Courier New';
        ctx.fontWeight = 'bold';
        ctx.fillText(this.text, this.x, this.y);
        ctx.globalAlpha = 1.0;
    }
}


// ==========================================
// GAME LOOP
// ==========================================

function resizeCanvas() {
    const parent = document.getElementById('combat-zone');
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    gameWidth = canvas.width;
    gameHeight = canvas.height;
}

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = timestamp - lastTime;
    lastTime = timestamp;

    if (gameState) {
        gameState.update(dt);
        ctx.clearRect(0, 0, gameWidth, gameHeight);
        gameState.draw(ctx);
    }

    requestAnimationFrame(gameLoop);
}

// ==========================================
// UI MANAGER
// ==========================================
const ui = {
    showNotification(msg, type = 'info') {
        const container = document.getElementById('notification-container');
        const notif = document.createElement('div');
        notif.className = 'notification';
        notif.style.borderColor = type === 'error' ? '#ff3333' : '#ffb300';
        notif.style.color = type === 'error' ? '#ff3333' : '#ffb300';
        notif.innerText = msg;
        container.appendChild(notif);
        setTimeout(() => {
            if(container.contains(notif)) container.removeChild(notif);
        }, 3000);
    },

    updateResources() {
        document.getElementById('res-scrap').innerText = Math.floor(gameState.resources.scrap);
        document.getElementById('res-scrap-max').innerText = gameState.resources.scrapMax;
        document.getElementById('res-data').innerText = gameState.resources.data;
        document.getElementById('res-energy').innerText = gameState.resources.energy;
        document.getElementById('res-barricade').innerText = Math.max(0, Math.floor(gameState.resources.barricade));
        document.getElementById('res-barricade-max').innerText = gameState.resources.barricadeMax;
        document.getElementById('res-wave').innerText = gameState.wave;
    },

    renderModules() {
        const container = document.getElementById('modules-container');
        container.innerHTML = '';
        for (const [id, mod] of Object.entries(gameState.modules)) {
            const card = document.createElement('div');
            card.className = 'card';

            let btnText = mod.level >= mod.maxLevel ? 'MAX' : `Улучшить (${mod.cost} ⚙️)`;
            let energyReq = id !== 'generator' ? `Требует: ${(mod.level + 1) * 5} ⚡` : `Дает: ${(mod.level+1)*10} ⚡`;
            if (mod.level >= mod.maxLevel) energyReq = "Макс. уровень";

            card.innerHTML = `
                <h4>${mod.name} (Ур. ${mod.level}/${mod.maxLevel})</h4>
                <p>${mod.desc}</p>
                <div class="stats">${energyReq}</div>
                <button ${mod.level >= mod.maxLevel ? 'disabled' : ''} onclick="gameState.upgradeModule('${id}')">${btnText}</button>
            `;
            container.appendChild(card);
        }
    },

    renderHiring() {
        const container = document.getElementById('mercs-container');
        container.innerHTML = '';

        const costMod = 1 - (gameState.modules.recreation.level * 0.05);
        const mercs = [
            { type: 'Новобранец', cost: Math.floor(50 * costMod), desc: 'Обычный пистолет. Базовый юнит.', hp: 100, dmg: 15, spd: 'Средне' },
            { type: 'Штурмовик', cost: Math.floor(150 * costMod), desc: 'Автомат. Очень быстрая стрельба.', hp: 120, dmg: 10, spd: 'Быстро' },
            { type: 'Снайпер', cost: Math.floor(250 * costMod), desc: 'Винтовка. Редко, но метко.', hp: 80, dmg: 100, spd: 'Медленно' }
        ];

        mercs.forEach(m => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <h4>${m.type}</h4>
                <p>${m.desc}</p>
                <div class="stats">HP: ${m.hp} | Урон: ${m.dmg} | Скор.: ${m.spd}</div>
                <button onclick="gameState.hireMerc('${m.type}')">Нанять (${m.cost} ⚙️)</button>
            `;
            container.appendChild(card);
        });
    },

    renderSquad() {
        const container = document.getElementById('active-squad-container');
        container.innerHTML = '';

        gameState.squad.forEach((s, index) => {
            const div = document.createElement('div');
            div.className = 'squad-item';
            const hpPct = (s.hp / s.maxHp) * 100;
            div.innerHTML = `
                <div class="squad-item-info">
                    <div class="squad-item-name">${s.type}</div>
                    <div class="squad-item-hp-bar">
                        <div class="squad-item-hp-fill" style="width: ${hpPct}%"></div>
                    </div>
                </div>
                <div style="color: #bbb; font-size: 12px; margin-left: 10px; margin-right: 10px;">
                    HP: ${Math.floor(s.hp)}/${Math.floor(s.maxHp)}
                </div>
                <button onclick="gameState.dismissMerc(${index})" style="padding: 5px; background: #ff3333; color: white; border: none; cursor: pointer; border-radius: 3px;" title="Уволить (вернет 50% хлама)">✖</button>
            `;
            container.appendChild(div);
        });
    },

    renderQuests() {
        const container = document.getElementById('quests-container');
        if (!container) return;
        container.innerHTML = '';

        gameState.allQuests.forEach(q => {
            const completed = gameState.completedQuests.includes(q.id);
            const div = document.createElement('div');
            div.className = 'quest-item';

            let progressText = "";
            if (!completed) {
                if (q.type === 'kill_zombie') progressText = `${gameState.questProgress.zombiesKilled} / ${q.target}`;
                else if (q.type === 'build_module') progressText = `Ур. ${gameState.modules[q.targetId].level} / ${q.targetLvl}`;
                else if (q.type === 'collect_scrap') progressText = `${gameState.questProgress.scrapCollected || 0} / ${q.target}`;
                else if (q.type === 'collect_data') progressText = `${gameState.questProgress.dataCollected || 0} / ${q.target}`;
                else progressText = "В процессе...";
            }

            div.innerHTML = `
                <div class="quest-info">
                    <h4>${q.title}</h4>
                    <p>${q.desc}</p>
                    <div class="quest-reward">Награда: ${q.reward.scrap > 0 ? q.reward.scrap + ' ⚙️ ' : ''}${q.reward.data > 0 ? q.reward.data + ' 💾' : ''}</div>
                </div>
                <div class="quest-status ${completed ? 'completed' : ''}">
                    ${completed ? 'ВЫПОЛНЕНО' : `<span class="quest-progress-text">${progressText}</span>`}
                </div>
            `;
            container.appendChild(div);
        });
    },

    setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

                e.target.classList.add('active');
                const tabId = e.target.getAttribute('data-tab');
                document.getElementById(tabId).classList.add('active');
            });
        });
    },

    updateAll() {
        this.updateResources();
        this.renderModules();
        this.renderHiring();
        this.renderSquad();
        this.renderQuests();
    }
};

// Start Wave button event
document.getElementById('next-wave-btn').addEventListener('click', () => {
    if (gameState) gameState.startWave();
});

// ==========================================
// INITIALIZATION
// ==========================================

function init() {
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    gameState = new GameState();

    // Give some starting resources for testing
    gameState.resources.scrap = 200;

    audioManager.init();
    document.getElementById('mute-btn').addEventListener('click', () => {
        audioManager.toggleMute();
    });

    gameState.load();
    ui.setupTabs();
    ui.updateAll();

    // Setup Restart Button
    document.getElementById('restart-btn').addEventListener('click', () => {
        localStorage.removeItem('revotick_save');
        location.reload();
    });

    requestAnimationFrame(gameLoop);
}

// Start game
document.addEventListener('DOMContentLoaded', init);
