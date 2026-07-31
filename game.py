import pygame
import json
import os
import time
import math
import random

# Initialize pygame
pygame.init()

# Constants
WIDTH = 1000
HEIGHT = 700
FPS = 60

# Colors
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
GRAY = (50, 50, 50)
LIGHT_GRAY = (150, 150, 150)
RED = (200, 50, 50)
GREEN = (50, 200, 50)
BLUE = (50, 100, 200)
YELLOW = (200, 200, 50)
CYAN = (50, 200, 200)

screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Убежище: Симулятор Выживания и Обороны")
clock = pygame.time.Clock()

font_small = pygame.font.SysFont("Arial", 16)
font_medium = pygame.font.SysFont("Arial", 24)
font_large = pygame.font.SysFont("Arial", 36)

class GameState:
    def __init__(self):
        self.supplies = 100
        self.energy_used = 0
        self.energy_total = 0
        self.modules = {
            "generator": {"level": 0},
            "food_block": {"level": 0},
            "workbench": {"level": 0},
            "recreation": {"level": 0},
            "storage": {"level": 0},
            "medbay": {"level": 0},
            "training": {"level": 0},
            "radio": {"level": 0},
            "armory": {"level": 0}
        }
        self.soldiers = []
        self.door_hp = 1000
        self.door_max_hp = 1000
        self.wave = 1
        self.quest_id = 1
        self.quest_progress = {}

    def load(self, filename="save.json"):
        if os.path.exists(filename):
            try:
                with open(filename, "r") as f:
                    data = json.load(f)
                    self.supplies = data.get("supplies", 100)
                    # Merge module dicts to preserve structure in case of old saves
                    saved_modules = data.get("modules", {})
                    for k in self.modules.keys():
                        if k in saved_modules:
                            self.modules[k] = saved_modules[k]
                    self.soldiers = data.get("soldiers", [])
                    self.wave = data.get("wave", 1)
                    self.quest_id = data.get("quest_id", 1)
                    self.quest_progress = data.get("quest_progress", {})
            except Exception as e:
                print(f"Error loading save file: {e}. Starting new game.")
        self.active_screen = "COMBAT"
        self.update_stats()

    def save(self, filename="save.json"):
        data = {
            "supplies": self.supplies,
            "modules": self.modules,
            "soldiers": [{"class": s.cls_name, "hp": s.hp, "max_hp": s.max_hp} if hasattr(s, 'cls_name') else s for s in self.soldiers],
            "wave": self.wave,
            "quest_id": self.quest_id,
            "quest_progress": self.quest_progress
        }
        try:
            with open(filename, "w") as f:
                json.dump(data, f)
        except Exception as e:
            print(f"Error saving game: {e}")

    def update_stats(self):
        old_hp_buff = getattr(self, 'hp_buff', 1.0)

        # Recalculate energy and other global stats
        self.energy_total = self.modules["generator"]["level"] * 5
        self.energy_used = sum(m["level"] for k, m in self.modules.items() if k != "generator")

        # Buffs based on modules
        self.hp_buff = 1.0 + (self.modules["food_block"]["level"] * 0.15)
        self.dmg_buff = 1.0 + (self.modules["workbench"]["level"] * 0.20)
        self.fire_rate_buff = 1.0 + (self.modules["recreation"]["level"] * 0.10)
        self.hire_discount = 1.0 - (self.modules["recreation"]["level"] * 0.05)

        self.max_supplies = 500 + (self.modules["storage"]["level"] * 500)
        if self.supplies > self.max_supplies:
            self.supplies = self.max_supplies

        self.hp_regen = self.modules["medbay"]["level"] * 2
        self.dmg_buff *= (1.0 + self.modules["training"]["level"] * 0.10)
        self.supplies_income = self.modules["radio"]["level"] * 5
        self.door_max_hp = 1000 + (self.modules["storage"]["level"] * 100) + (self.modules["armory"]["level"] * 200)
        if hasattr(self, 'door_hp') and self.door_hp > self.door_max_hp:
            self.door_hp = self.door_max_hp

        if hasattr(self, 'soldiers') and self.soldiers:
            for s in self.soldiers:
                if not isinstance(s, dict) and hasattr(s, 'max_hp'):
                    ratio = self.hp_buff / old_hp_buff
                    s.max_hp = s.max_hp * ratio
                    s.hp = min(s.max_hp, s.hp * ratio)

state = GameState()
state.load()

def draw_ui(screen, state):
    # Top bar background
    pygame.draw.rect(screen, GRAY, (0, 0, WIDTH, 80))
    pygame.draw.line(screen, LIGHT_GRAY, (0, 80), (WIDTH, 80), 2)

    # Resources
    res_text = font_medium.render(f"Припасы: {int(state.supplies)}/{state.max_supplies} | Энергия: {state.energy_total - state.energy_used}/{state.energy_total}", True, WHITE)
    screen.blit(res_text, (20, 10))

    # Quest Info
    if state.quest_id in QUESTS:
        q_text = QUESTS[state.quest_id]["desc"]
    else:
        q_text = "Все квесты выполнены!"
    quest_text = font_medium.render(f"Квест: {q_text}", True, YELLOW)
    screen.blit(quest_text, (WIDTH - quest_text.get_width() - 20, 10))

    # Tabs
    combat_tab_rect = pygame.Rect(20, 45, 200, 35)
    shelter_tab_rect = pygame.Rect(230, 45, 200, 35)

    combat_color = BLUE if state.active_screen == "COMBAT" else LIGHT_GRAY
    shelter_color = BLUE if state.active_screen == "SHELTER" else LIGHT_GRAY

    pygame.draw.rect(screen, combat_color, combat_tab_rect, border_radius=5)
    pygame.draw.rect(screen, shelter_color, shelter_tab_rect, border_radius=5)

    combat_text = font_small.render("БОЕВАЯ ЗОНА", True, WHITE)
    shelter_text = font_small.render("УБЕЖИЩЕ", True, WHITE)

    screen.blit(combat_text, (combat_tab_rect.centerx - combat_text.get_width()//2, combat_tab_rect.centery - combat_text.get_height()//2))
    screen.blit(shelter_text, (shelter_tab_rect.centerx - shelter_text.get_width()//2, shelter_tab_rect.centery - shelter_text.get_height()//2))

    return combat_tab_rect, shelter_tab_rect

SOLDIER_CLASSES = {
    "assault": {"name": "Штурмовик", "hp": 100, "dmg": 15, "range": 400, "cooldown": 0.5, "cost": 50, "color": BLUE},
    "sniper": {"name": "Снайпер", "hp": 80, "dmg": 50, "range": 800, "cooldown": 2.0, "cost": 80, "color": GREEN},
    "shotgun": {"name": "Дробовик", "hp": 120, "dmg": 30, "range": 250, "cooldown": 1.5, "cost": 70, "color": YELLOW},
    "medic": {"name": "Медик", "hp": 90, "dmg": 5, "range": 300, "cooldown": 1.0, "cost": 100, "color": CYAN, "heal": 20},
    "turret": {"name": "Авто-турель", "hp": 200, "dmg": 10, "range": 500, "cooldown": 0.2, "cost": 150, "color": LIGHT_GRAY, "req_workbench": 1}
}

class Soldier:
    def __init__(self, cls_name, state, saved_hp=None):
        self.cls_name = cls_name
        data = SOLDIER_CLASSES[cls_name]
        self.max_hp = data["hp"] * state.hp_buff
        self.hp = saved_hp if saved_hp is not None else self.max_hp
        self.dmg = data["dmg"]
        self.range = data["range"]
        self.base_cooldown = data["cooldown"]
        self.color = data["color"]
        self.heal = data.get("heal", 0)

        self.cooldown_timer = 0
        if cls_name == "turret":
            self.x = 160 + random.randint(0, 10)
            self.y = HEIGHT - 300 + random.randint(0, 80)
        else:
            self.x = 200 + random.randint(-20, 20)
            self.y = HEIGHT - 200 + random.randint(-20, 20)

        self.shelter_x = WIDTH // 2 + random.randint(-50, 50)
        self.shelter_y = HEIGHT - 100
        self.target_sx = self.shelter_x
        self.target_sy = self.shelter_y
        self.shelter_timer = 0

    def update_shelter(self, dt, shelter_ui):
        if self.hp <= 0 or self.cls_name == "turret": return

        # Move towards target
        dx = self.target_sx - self.shelter_x
        dy = self.target_sy - self.shelter_y
        dist = math.hypot(dx, dy)
        if dist > 5:
            speed = 50
            self.shelter_x += (dx/dist) * speed * dt
            self.shelter_y += (dy/dist) * speed * dt
        else:
            self.shelter_timer -= dt
            if self.shelter_timer <= 0:
                # Pick a random unlocked room
                available_rooms = [m_id for m_id, m_data in shelter_ui.state_ref.modules.items() if m_data["level"] > 0]
                if available_rooms:
                    room_id = random.choice(available_rooms)
                    rx, ry, rw, rh = shelter_ui.positions[room_id]
                    self.target_sx = rx + random.randint(20, rw - 20)
                    self.target_sy = ry + rh - 20
                self.shelter_timer = random.uniform(3, 8)

    def draw_shelter(self, screen):
        if self.hp <= 0 or self.cls_name == "turret": return
        pygame.draw.circle(screen, self.color, (int(self.shelter_x), int(self.shelter_y)), 10)
        pygame.draw.circle(screen, BLACK, (int(self.shelter_x), int(self.shelter_y)), 10, 1)

    def update(self, dt, state, zombies, bullets, floating_texts):
        if self.hp <= 0: return

        self.cooldown_timer -= dt
        if self.cooldown_timer <= 0:
            if self.cls_name == "medic":
                # Find lowest HP ally
                target = None
                lowest_hp_pct = 1.0
                for s in state.soldiers:
                    if s != self and s.hp > 0 and (s.hp / s.max_hp) < lowest_hp_pct:
                        target = s
                        lowest_hp_pct = s.hp / s.max_hp

                if target and lowest_hp_pct < 1.0:
                    target.hp = min(target.max_hp, target.hp + self.heal * state.dmg_buff)
                    self.cooldown_timer = self.base_cooldown / state.fire_rate_buff
                    floating_texts.append(FloatingText(target.x, target.y - 20, f"+{int(self.heal * state.dmg_buff)} HP", GREEN))
            else:
                # Find nearest zombie
                target = None
                min_dist = self.range
                for z in zombies:
                    dist = math.hypot(z.x - self.x, z.y - self.y)
                    if dist < min_dist:
                        target = z
                        min_dist = dist

                if target:
                    dmg = self.dmg * state.dmg_buff
                    if self.cls_name == "shotgun":
                        # Hit multiple
                        for z in zombies:
                            if math.hypot(z.x - self.x, z.y - self.y) < self.range:
                                bullets.append(Bullet(self.x, self.y, z.x, z.y, dmg, YELLOW))
                    else:
                        bullets.append(Bullet(self.x, self.y, target.x, target.y, dmg, YELLOW))
                    self.cooldown_timer = self.base_cooldown / state.fire_rate_buff

    def draw(self, screen):
        if self.hp <= 0: return
        pygame.draw.circle(screen, self.color, (int(self.x), int(self.y)), 15)
        # Gun barrel
        pygame.draw.line(screen, WHITE, (self.x, self.y), (self.x + 20, self.y), 3)
        # HP bar
        hp_pct = max(0, self.hp / self.max_hp)
        pygame.draw.rect(screen, RED, (self.x - 15, self.y - 25, 30, 5))
        pygame.draw.rect(screen, GREEN, (self.x - 15, self.y - 25, 30 * hp_pct, 5))

ZOMBIE_TYPES = {
    "walker": {"hp": 50, "speed": 30, "dmg": 5, "color": (150, 200, 50)},
    "runner": {"hp": 30, "speed": 80, "dmg": 3, "color": (200, 100, 50)},
    "tank": {"hp": 300, "speed": 15, "dmg": 20, "color": (100, 150, 50)}
}

class Zombie:
    def __init__(self, z_type, wave):
        data = ZOMBIE_TYPES[z_type]
        self.type = z_type
        # Scale with wave
        scale = 1.0 + (wave * 0.1)
        self.max_hp = data["hp"] * scale
        self.hp = self.max_hp
        self.speed = data["speed"]
        self.dmg = data["dmg"] * scale
        self.color = data["color"]

        self.x = WIDTH + random.randint(0, 200)
        self.y = HEIGHT - 200 + random.randint(-40, 40)
        self.attack_cooldown = 0

    def update(self, dt, state):
        if self.hp <= 0: return

        # Target closest soldier or door
        target = None
        min_dist = float('inf')
        for s in state.soldiers:
            if s.hp > 0:
                dist = math.hypot(s.x - self.x, s.y - self.y)
                if dist < min_dist:
                    target = s
                    min_dist = dist

        # Door is at x = 150
        dist_to_door = self.x - 150
        if dist_to_door < min_dist:
            target = "door"
            min_dist = dist_to_door

        if min_dist > 30: # Move towards
            if target == "door":
                self.x -= self.speed * dt
            else:
                dx = target.x - self.x
                dy = target.y - self.y
                dist = math.hypot(dx, dy)
                self.x += (dx/dist) * self.speed * dt
                self.y += (dy/dist) * self.speed * dt
        else: # Attack
            self.attack_cooldown -= dt
            if self.attack_cooldown <= 0:
                if target == "door":
                    state.door_hp -= self.dmg
                else:
                    target.hp -= self.dmg
                self.attack_cooldown = 1.0

    def draw(self, screen):
        if self.hp <= 0: return
        size = 20 if self.type == "tank" else 15
        pygame.draw.rect(screen, self.color, (self.x - size//2, self.y - size, size, size*2))
        hp_pct = max(0, self.hp / self.max_hp)
        pygame.draw.rect(screen, RED, (self.x - 15, self.y - size - 10, 30, 5))
        pygame.draw.rect(screen, GREEN, (self.x - 15, self.y - size - 10, 30 * hp_pct, 5))

class Bullet:
    def __init__(self, x, y, tx, ty, dmg, color):
        self.x = x
        self.y = y
        self.tx = tx
        self.ty = ty
        self.dmg = dmg
        self.color = color
        self.speed = 800

        dx = tx - x
        dy = ty - y
        dist = math.hypot(dx, dy)
        self.vx = (dx/dist) * self.speed
        self.vy = (dy/dist) * self.speed

        # Time to live to prevent infinite bullets
        self.ttl = dist / self.speed

    def update(self, dt, zombies):
        self.x += self.vx * dt
        self.y += self.vy * dt
        self.ttl -= dt

        if self.ttl <= 0:
            # Hit target area, apply damage to closest zombie
            target = None
            min_dist = 40
            for z in zombies:
                dist = math.hypot(z.x - self.x, z.y - self.y)
                if dist < min_dist:
                    target = z
                    min_dist = dist
            if target:
                target.hp -= self.dmg
            return True # Dead
        return False

    def draw(self, screen):
        pygame.draw.line(screen, self.color, (self.x, self.y), (self.x - self.vx*0.02, self.y - self.vy*0.02), 2)

class FloatingText:
    def __init__(self, x, y, text, color):
        self.x = x
        self.y = y
        self.text = text
        self.color = color
        self.life = 1.5

    def update(self, dt):
        self.y -= 30 * dt
        self.life -= dt
        return self.life <= 0

    def draw(self, screen):
        surf = font_small.render(self.text, True, self.color)
        screen.blit(surf, (self.x, self.y))

QUESTS = {
    1: {"desc": "Построй Генераторную 1 уровня", "reward": 100},
    2: {"desc": "Отрази 1-ю волну зомби", "reward": 150},
    3: {"desc": "Построй Пищеблок и Найми 2 солдат", "reward": 300},
    4: {"desc": "Улучши Верстак до 2 уровня", "reward": 500}
}

class QuestSystem:
    def check_quests(self, state, floating_texts):
        if state.quest_id not in QUESTS: return

        completed = False
        if state.quest_id == 1:
            if state.modules["generator"]["level"] >= 1:
                completed = True
        elif state.quest_id == 2:
            if state.wave > 1:
                completed = True
        elif state.quest_id == 3:
            if state.modules["food_block"]["level"] >= 1 and len(state.soldiers) >= 2:
                completed = True
        elif state.quest_id == 4:
            if state.modules["workbench"]["level"] >= 2:
                completed = True

        if completed:
            reward = QUESTS[state.quest_id]["reward"]
            state.supplies = min(state.max_supplies, state.supplies + reward)
            floating_texts.append(FloatingText(WIDTH//2, 80, f"КВЕСТ ВЫПОЛНЕН! +{reward} Припасов", CYAN))
            state.quest_id += 1


class CombatManager:
    def __init__(self):
        self.zombies = []
        self.bullets = []
        self.floating_texts = []
        self.wave_active = False
        self.zombies_to_spawn = []
        self.spawn_timer = 0

        self.btn_next_wave = pygame.Rect(WIDTH//2 - 150, 100, 300, 50)

        self.hire_btns = {}
        bx = 20
        for cls_name, data in SOLDIER_CLASSES.items():
            self.hire_btns[cls_name] = pygame.Rect(bx, HEIGHT - 80, 150, 60)
            bx += 160

    def start_wave(self, state):
        self.wave_active = True
        num_zombies = 5 + state.wave * 2
        self.zombies_to_spawn = []
        for _ in range(num_zombies):
            r = random.random()
            if r < 0.1 and state.wave > 2:
                self.zombies_to_spawn.append("tank")
            elif r < 0.3 and state.wave > 1:
                self.zombies_to_spawn.append("runner")
            else:
                self.zombies_to_spawn.append("walker")

    def update(self, dt, state, quest_sys):
        if self.wave_active:
            self.spawn_timer -= dt
            if self.spawn_timer <= 0 and self.zombies_to_spawn:
                z_type = self.zombies_to_spawn.pop(0)
                self.zombies.append(Zombie(z_type, state.wave))
                self.spawn_timer = random.uniform(0.5, 2.0)

            if not self.zombies_to_spawn and not self.zombies:
                self.wave_active = False
                state.wave += 1

        for s in state.soldiers:
            s.update(dt, state, self.zombies, self.bullets, self.floating_texts)

        for z in self.zombies:
            z.update(dt, state)
            if z.hp <= 0:
                reward = random.randint(5, 15)
                state.supplies = min(state.max_supplies, state.supplies + reward)
                self.floating_texts.append(FloatingText(z.x, z.y, f"+{reward}", YELLOW))

        self.zombies = [z for z in self.zombies if z.hp > 0]
        state.soldiers = [s for s in state.soldiers if s.hp > 0]

        self.bullets = [b for b in self.bullets if not b.update(dt, self.zombies)]
        self.floating_texts = [ft for ft in self.floating_texts if not ft.update(dt)]

        if state.door_hp <= 0:
            # Game Over logic - just reset for now
            state.door_hp = state.door_max_hp
            state.wave = max(1, state.wave - 1)
            self.wave_active = False
            self.zombies.clear()

        quest_sys.check_quests(state, self.floating_texts)

    def draw(self, screen, state):
        screen.fill((20, 20, 30)) # Dark night sky

        # Ground
        pygame.draw.rect(screen, (50, 40, 30), (0, HEIGHT - 200, WIDTH, 200))

        # Bunker door
        pygame.draw.rect(screen, GRAY, (0, HEIGHT - 350, 150, 200))
        door_pct = max(0, state.door_hp / state.door_max_hp)
        pygame.draw.rect(screen, RED, (10, HEIGHT - 370, 130, 10))
        pygame.draw.rect(screen, GREEN, (10, HEIGHT - 370, 130 * door_pct, 10))
        door_text = font_small.render(f"ДВЕРЬ {int(state.door_hp)}/{state.door_max_hp}", True, WHITE)
        screen.blit(door_text, (20, HEIGHT - 390))

        for s in state.soldiers: s.draw(screen)
        for z in self.zombies: z.draw(screen)
        for b in self.bullets: b.draw(screen)
        for ft in self.floating_texts: ft.draw(screen)

        # UI
        if not self.wave_active:
            pygame.draw.rect(screen, GREEN, self.btn_next_wave, border_radius=10)
            btn_txt = font_large.render(f"ЗАПУСТИТЬ ВОЛНУ {state.wave}", True, WHITE)
            screen.blit(btn_txt, (self.btn_next_wave.centerx - btn_txt.get_width()//2, self.btn_next_wave.centery - btn_txt.get_height()//2))
        else:
            info_txt = font_large.render(f"Волна {state.wave} - Врагов осталось: {len(self.zombies) + len(self.zombies_to_spawn)}", True, RED)
            screen.blit(info_txt, (WIDTH//2 - info_txt.get_width()//2, 100))

        # Hire buttons
        for cls_name, rect in self.hire_btns.items():
            data = SOLDIER_CLASSES[cls_name]
            req_wb = data.get("req_workbench", 0)
            if req_wb > 0 and state.modules["workbench"]["level"] < req_wb:
                pygame.draw.rect(screen, GRAY, rect, border_radius=5)
                name_txt = font_small.render(data["name"], True, BLACK)
                req_txt = font_small.render(f"Верстак {req_wb}", True, RED)
                screen.blit(name_txt, (rect.centerx - name_txt.get_width()//2, rect.y + 10))
                screen.blit(req_txt, (rect.centerx - req_txt.get_width()//2, rect.y + 35))
                continue

            cost = int(data["cost"] * state.hire_discount)
            color = data["color"] if state.supplies >= cost else GRAY
            pygame.draw.rect(screen, color, rect, border_radius=5)
            name_txt = font_small.render(data["name"], True, BLACK)
            cost_txt = font_small.render(f"{cost} Припасов", True, BLACK)
            screen.blit(name_txt, (rect.centerx - name_txt.get_width()//2, rect.y + 10))
            screen.blit(cost_txt, (rect.centerx - cost_txt.get_width()//2, rect.y + 35))

    def handle_click(self, pos, state):
        if not self.wave_active and self.btn_next_wave.collidepoint(pos):
            self.start_wave(state)

        for cls_name, rect in self.hire_btns.items():
            if rect.collidepoint(pos):
                data = SOLDIER_CLASSES[cls_name]
                req_wb = data.get("req_workbench", 0)
                if req_wb > 0 and state.modules["workbench"]["level"] < req_wb:
                    continue
                cost = int(data["cost"] * state.hire_discount)
                if state.supplies >= cost:
                    state.supplies -= cost
                    state.soldiers.append(Soldier(cls_name, state))

MODULE_INFO = {
    "generator": {"name": "ГЕНЕРАТОРНАЯ", "desc": "Производит Энергию (+5 за ур.)", "cost": 50, "color": (80, 80, 50)},
    "food_block": {"name": "ПИЩЕБЛОК", "desc": "+15% HP солдат за ур.", "cost": 40, "color": (50, 80, 50)},
    "workbench": {"name": "ВЕРСТАК", "desc": "+20% Урон за ур.", "cost": 60, "color": (80, 50, 50)},
    "recreation": {"name": "ЗОНА ОТДЫХА", "desc": "+10% Скор. атаки, -5% Цена", "cost": 45, "color": (50, 50, 80)},
    "storage": {"name": "СКЛАД", "desc": "+100 HP Двери, +Вместимость", "cost": 30, "color": (60, 60, 60)},
    "medbay": {"name": "МЕДБЛОК", "desc": "+2 Реген HP/сек за ур.", "cost": 55, "color": (50, 80, 80)},
    "training": {"name": "ТРЕНИРОВОЧНАЯ", "desc": "+10% Урон (Множитель)", "cost": 65, "color": (80, 60, 40)},
    "radio": {"name": "РАДИОРУБКА", "desc": "+5 Припасов/10 сек", "cost": 75, "color": (40, 80, 40)},
    "armory": {"name": "ОРУЖЕЙНАЯ", "desc": "+200 HP Двери за ур.", "cost": 85, "color": (70, 40, 40)}
}

class ShelterUI:
    def __init__(self):
        self.buttons = {}
        self.state_ref = None # Will set during update
        # 3x3 Grid layout for 9 modules
        self.positions = {}
        idx = 0
        grid_cols = 3
        cell_w, cell_h = 300, 180
        start_x, start_y = 50, 110
        for mod_id in MODULE_INFO.keys():
            col = idx % grid_cols
            row = idx // grid_cols
            self.positions[mod_id] = (start_x + col * (cell_w + 10), start_y + row * (cell_h + 10), cell_w, cell_h)
            idx += 1

    def draw(self, screen, state):
        screen.fill((20, 20, 25)) # Deep underground bunker background

        self.buttons.clear()

        # Draw central elevator shaft/corridor
        pygame.draw.rect(screen, (40, 40, 45), (480, 100, 40, 600))

        for mod_id, mod_data in MODULE_INFO.items():
            x, y, w, h = self.positions[mod_id]
            color = mod_data.get("color", (50, 50, 60))

            # Module Box (Room)
            pygame.draw.rect(screen, color, (x, y, w, h), border_radius=5)
            pygame.draw.rect(screen, LIGHT_GRAY, (x, y, w, h), 3, border_radius=5)

            # Draw door to corridor
            if x < 480: # Left side
                pygame.draw.rect(screen, GRAY, (x + w - 10, y + h - 60, 10, 60))
            elif x > 480: # Right side
                pygame.draw.rect(screen, GRAY, (x, y + h - 60, 10, 60))

            lvl = state.modules.get(mod_id, {"level": 0})["level"]

            # Text
            name_text = font_medium.render(f"{mod_data['name']} (Ур. {lvl})", True, CYAN)
            screen.blit(name_text, (x + 10, y + 10))

            desc_text = font_small.render(mod_data['desc'], True, WHITE)
            screen.blit(desc_text, (x + 10, y + 40))

            # Upgrade button
            cost = mod_data['cost'] * (lvl + 1)
            btn_rect = pygame.Rect(x + w - 110, y + h - 45, 100, 35)

            can_afford_supplies = state.supplies >= cost
            can_afford_energy = (mod_id == "generator") or ((state.energy_total - state.energy_used) >= 1)

            btn_color = GREEN if (can_afford_supplies and can_afford_energy) else RED
            pygame.draw.rect(screen, btn_color, btn_rect, border_radius=5)

            upg_text = font_small.render(f"Улучшить", True, WHITE)
            screen.blit(upg_text, (btn_rect.centerx - upg_text.get_width()//2, btn_rect.centery - 15))
            cost_text = font_small.render(f"{cost} Прип.", True, WHITE)
            screen.blit(cost_text, (btn_rect.centerx - cost_text.get_width()//2, btn_rect.centery + 2))

            if not can_afford_energy and mod_id != "generator":
                warn_text = font_small.render("Нет Энергии!", True, RED)
                screen.blit(warn_text, (btn_rect.x, btn_rect.y - 20))

            self.buttons[mod_id] = btn_rect

        # Draw Soldiers in Shelter
        for s in state.soldiers:
            if hasattr(s, 'draw_shelter'):
                s.draw_shelter(screen)

    def handle_click(self, pos, state):
        for mod_id, btn_rect in self.buttons.items():
            if btn_rect.collidepoint(pos):
                lvl = state.modules.get(mod_id, {"level": 0})["level"]
                cost = MODULE_INFO[mod_id]['cost'] * (lvl + 1)

                can_afford_supplies = state.supplies >= cost
                can_afford_energy = (mod_id == "generator") or ((state.energy_total - state.energy_used) >= 1)

                if can_afford_supplies and can_afford_energy:
                    state.supplies -= cost
                    state.modules[mod_id]["level"] += 1
                    state.update_stats()


def main():
    running = True
    last_save_time = time.time()
    shelter_ui = ShelterUI()
    combat_mgr = CombatManager()
    quest_sys = QuestSystem()

    # Reload soldiers from save to proper objects
    saved_soldiers = state.soldiers
    state.soldiers = []
    for s_data in saved_soldiers:
        if isinstance(s_data, dict):
            s = Soldier(s_data["class"], state, saved_hp=s_data.get("hp"))
            state.soldiers.append(s)

    # Set door hp if first load
    if not hasattr(state, 'door_hp'):
        state.door_hp = state.door_max_hp

    while running:
        current_time = time.time()
        dt = clock.tick(FPS) / 1000.0

        # Update logic
        if state.active_screen == "COMBAT":
            combat_mgr.update(dt, state, quest_sys)
        else:
            shelter_ui.state_ref = state
            for s in state.soldiers:
                if hasattr(s, 'update_shelter'):
                    s.update_shelter(dt, shelter_ui)
            quest_sys.check_quests(state, combat_mgr.floating_texts)

        # Autosave every 10 seconds
        if current_time - last_save_time >= 10:
            state.save()
            last_save_time = current_time

        combat_tab_rect = pygame.Rect(20, 45, 200, 35)
        shelter_tab_rect = pygame.Rect(230, 45, 200, 35)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.MOUSEBUTTONDOWN:
                if event.button == 1:
                    if combat_tab_rect.collidepoint(event.pos):
                        state.active_screen = "COMBAT"
                    elif shelter_tab_rect.collidepoint(event.pos):
                        state.active_screen = "SHELTER"
                    elif state.active_screen == "SHELTER":
                        shelter_ui.handle_click(event.pos, state)
                    elif state.active_screen == "COMBAT":
                        combat_mgr.handle_click(event.pos, state)

        # Draw everything
        if state.active_screen == "COMBAT":
            combat_mgr.draw(screen, state)
        else:
            shelter_ui.draw(screen, state)

        combat_tab_rect, shelter_tab_rect = draw_ui(screen, state)

        pygame.display.flip()

    state.save()
    pygame.quit()

if __name__ == "__main__":
    main()
