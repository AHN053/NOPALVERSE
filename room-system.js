/* =========================================================
   NOPALVERSE: Space Adventure Academy
   PHASE 3 — Room & Progression System
   Depends on: game-logic.js (Enemy, ENEMY_HP), questions_data.json
   ========================================================= */

const { Enemy } = require("./game-logic.js");

const TOTAL_ROOMS = 50;
const ROOMS_PER_WORLD = 5; // room 1-4 normal, room 5 = boss

/* -----------------------------------------------------------
   ROOM PATTERN (repeats every 5 rooms, "dll sehingga bilik 50")
   position 1-4 = normal rooms, position 5 = boss room
   ----------------------------------------------------------- */
const ROOM_PATTERN = {
  1: { difficultyPool: ["senang"], enemyCount: 1, label: "Easy Room - few enemies" },
  2: { difficultyPool: ["senang", "sederhana"], enemyCount: 1, label: "Easy+Medium Room - few enemies" },
  3: { difficultyPool: ["senang", "sederhana", "susah"], enemyCount: 2, label: "Mixed Room - few enemies" },
  4: { difficultyPool: ["sederhana"], enemyCount: 2, label: "Medium Room - moderate enemies" },
  5: { difficultyPool: null, enemyCount: 1, label: "BOSS ROOM", isBoss: true } // uses BOSS_WEIGHTS instead
};

// Boss question distribution: 40% susah, 40% sederhana, 20% senang
const BOSS_WEIGHTS = { susah: 0.4, sederhana: 0.4, senang: 0.2 };

// Safety caps so encounters can't loop forever, but high enough that
// low-mark (senang-only) enemies can still always be reduced to 0 HP.
const MAX_QUESTIONS_NORMAL = 15; // normal enemy: 10 HP, worst case senang-only = 10 needed
const MAX_QUESTIONS_BOSS = 25;   // boss: 30 HP, weighted mix, worst case needs more draws

/* -----------------------------------------------------------
   Room config resolver
   ----------------------------------------------------------- */
function getRoomConfig(roomNumber) {
  if (roomNumber < 1 || roomNumber > TOTAL_ROOMS) {
    throw new Error(`Room ${roomNumber} out of range (1-${TOTAL_ROOMS})`);
  }
  const worldNumber = Math.ceil(roomNumber / ROOMS_PER_WORLD);
  const positionInWorld = ((roomNumber - 1) % ROOMS_PER_WORLD) + 1;
  const pattern = ROOM_PATTERN[positionInWorld];

  return {
    roomNumber,
    worldNumber,
    positionInWorld,
    isBoss: !!pattern.isBoss,
    difficultyPool: pattern.difficultyPool,
    enemyCount: pattern.enemyCount,
    label: pattern.label
  };
}

/* -----------------------------------------------------------
   Weighted random pick of a difficulty tier
   ----------------------------------------------------------- */
function pickWeightedDifficulty(weights) {
  const r = Math.random();
  let cumulative = 0;
  for (const [tier, w] of Object.entries(weights)) {
    cumulative += w;
    if (r <= cumulative) return tier;
  }
  return Object.keys(weights)[0];
}

function pickUniformDifficulty(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

/* -----------------------------------------------------------
   Build a question queue for ONE enemy.
   Keeps drawing questions (by difficulty) until the cumulative
   "mark" reaches/exceeds the enemy's HP, or the safety cap hits.
   ----------------------------------------------------------- */
function buildQuestionQueueForEnemy(enemy, difficultyPool, questionsData, weights = null) {
  const allQuestions = questionsData.questions;
  const queue = [];
  const usedIds = new Set();
  let cumulativeMark = 0;
  const maxQuestions = weights ? MAX_QUESTIONS_BOSS : MAX_QUESTIONS_NORMAL;

  while (cumulativeMark < enemy.maxHp && queue.length < maxQuestions) {
    const tier = weights ? pickWeightedDifficulty(weights) : pickUniformDifficulty(difficultyPool);
    const candidates = allQuestions.filter(
      q => q.difficulty === tier && !usedIds.has(q.id)
    );

    // fallback: if this tier is exhausted, allow reuse (question bank is finite)
    const pool = candidates.length > 0
      ? candidates
      : allQuestions.filter(q => q.difficulty === tier);

    if (pool.length === 0) break; // no questions of this tier exist at all

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    queue.push(chosen);
    usedIds.add(chosen.id);
    cumulativeMark += chosen.mark;
  }

  // Safety net: if we hit the cap but still haven't dealt enough mark
  // (extreme edge case), force-append highest-mark "susah" questions
  // so the enemy is always guaranteed to be defeatable.
  if (cumulativeMark < enemy.maxHp) {
    const susahPool = allQuestions.filter(q => q.difficulty === "susah");
    let i = 0;
    while (cumulativeMark < enemy.maxHp && susahPool.length > 0) {
      const q = susahPool[i % susahPool.length];
      queue.push(q);
      cumulativeMark += q.mark;
      i++;
    }
  }

  return queue;
}

/* -----------------------------------------------------------
   Enemy name pools (flavor for the sci-fi theme)
   ----------------------------------------------------------- */
const NORMAL_ENEMY_NAMES = [
  "Corrupted Data-Alien", "Glitch Drone", "Firewall Wraith",
  "Rogue Subroutine", "Static Crawler", "Broken Circuit Beast"
];
const BOSS_ENEMY_NAMES = [
  "Overlord Kernel", "The Mainframe Devourer", "Null Pointer Tyrant",
  "Archive Guardian Prime", "Sentinel of the Dead Server"
];

function randomName(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

/* -----------------------------------------------------------
   Room class
   ----------------------------------------------------------- */
class Room {
  constructor(roomNumber, questionsData) {
    this.config = getRoomConfig(roomNumber);
    this.enemies = this._generateEnemies(questionsData);
    this.currentEnemyIndex = 0;
    this.cleared = false;
    this.unlocked = false; // becomes true once player may proceed to next room
  }

  _generateEnemies(questionsData) {
    const { isBoss, enemyCount, difficultyPool } = this.config;
    const enemies = [];

    for (let i = 0; i < enemyCount; i++) {
      const enemy = isBoss
        ? new Enemy("boss", randomName(BOSS_ENEMY_NAMES))
        : new Enemy("normal", randomName(NORMAL_ENEMY_NAMES));

      enemy.questionQueue = buildQuestionQueueForEnemy(
        enemy,
        difficultyPool,
        questionsData,
        isBoss ? BOSS_WEIGHTS : null
      );
      enemy.expectedTotalMark = enemy.questionQueue.reduce((s, q) => s + q.mark, 0);

      enemies.push(enemy);
    }
    return enemies;
  }

  get currentEnemy() {
    return this.enemies[this.currentEnemyIndex];
  }

  allEnemiesDefeated() {
    return this.enemies.every(e => e.isDefeated);
  }

  advanceToNextEnemy() {
    if (this.currentEnemyIndex < this.enemies.length - 1) {
      this.currentEnemyIndex += 1;
      return true;
    }
    return false;
  }

  /**
   * Attempt to unlock the door to the next room.
   * - Boss room: auto-unlocks once boss is defeated (no key needed).
   * - Normal room: requires the player to spend 1 key (earned from
   *   defeating the room's enemies) to open the door.
   */
  tryUnlockNext(player) {
    if (!this.allEnemiesDefeated()) {
      return { success: false, reason: "Enemies still remain in this room." };
    }
    this.cleared = true;

    if (this.config.isBoss) {
      this.unlocked = true;
      return { success: true, method: "boss_auto_unlock" };
    }

    if (player.keys > 0) {
      player.keys -= 1;
      this.unlocked = true;
      return { success: true, method: "key_used", keysLeft: player.keys };
    }

    return { success: false, reason: "No key available to unlock the door." };
  }
}

/* -----------------------------------------------------------
   Exports
   ----------------------------------------------------------- */
if (typeof module !== "undefined") {
  module.exports = {
    TOTAL_ROOMS, ROOMS_PER_WORLD, ROOM_PATTERN, BOSS_WEIGHTS,
    getRoomConfig, buildQuestionQueueForEnemy, Room
  };
}
