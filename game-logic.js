/* =========================================================
   NOPALVERSE: Space Adventure Academy
   PHASE 2 — Core Game Systems (pure logic, no UI)
   ========================================================= */

// ---------- Utility ----------
function round1(n) {
  return Math.round(n * 10) / 10;
}

// ---------- Player ----------
class Player {
  constructor() {
    this.maxHp = 20;
    this.hp = 20;
    this.coin = 0;
    this.score = 0;
    this.keys = 0;
    this.powerUps = [];      // list of active power-up names
    this.combo = 0;          // current consecutive correct streak
    this.maxCombo = 0;
    this.correctCount = 0;
    this.wrongCount = 0;
    this.isAlive = true;
    this.attackMultiplier = 1; // affected by "Attack Boost" power-up
    this.shield = 0;            // "Shield" power-up: blocks N wrong-answer hits
  }

  reset() {
    Object.assign(this, new Player());
  }
}

// ---------- Enemy ----------
const ENEMY_HP = {
  normal: 10,
  boss: 30
};

class Enemy {
  constructor(type = "normal", name = "Alien Grunt") {
    this.type = type;                 // "normal" | "boss"
    this.name = name;
    this.maxHp = ENEMY_HP[type];
    this.hp = this.maxHp;
    this.isDefeated = false;
  }
}

// ---------- Difficulty tier config (from Phase 1) ----------
const TIER_CONFIG = {
  senang:    { coin: 1, mark: 1, score: 5,  damageToPlayer: 1 },
  sederhana: { coin: 2, mark: 3, score: 8,  damageToPlayer: 2 },
  susah:     { coin: 3, mark: 5, score: 10, damageToPlayer: 4 }
};

// ---------- Power-up pool ----------
const POWER_UP_POOL = [
  { id: "extra_hp",     name: "Extra HP +5",           apply: (p) => { p.maxHp += 5; p.hp += 5; } },
  { id: "attack_boost", name: "Attack Boost x1.5",     apply: (p) => { p.attackMultiplier = 1.5; } },
  { id: "shield",       name: "Shield (blocks 1 hit)", apply: (p) => { p.shield += 1; } },
  { id: "coin_magnet",  name: "Coin Magnet (+20% coin)", apply: (p) => { p.coinMagnet = true; } }
];

// ---------- Combat Engine ----------
class CombatEngine {
  constructor(player, enemy) {
    this.player = player;
    this.enemy = enemy;
  }

  /**
   * Resolve one question turn.
   * @param {object} question - question object from questions_data.json
   * @param {boolean} isCorrect - whether the player's answer was correct
   */
  resolveAnswer(question, isCorrect) {
    const result = {
      correct: isCorrect,
      comboCount: this.player.combo,
      enemyDefeated: false,
      playerDefeated: false,
      reward: null
    };

    if (isCorrect) {
      // --- combo increments BEFORE bonus calc ---
      this.player.combo += 1;
      this.player.maxCombo = Math.max(this.player.maxCombo, this.player.combo);
      this.player.correctCount += 1;

      const comboBonus = round1(this.player.combo * 0.2);
      let coinsEarned = round1(question.coin + comboBonus);
      const scoreEarned = round1(question.score + comboBonus);

      if (this.player.coinMagnet) coinsEarned = round1(coinsEarned * 1.2);

      const damageDealt = round1(question.mark * this.player.attackMultiplier);

      this.player.coin = round1(this.player.coin + coinsEarned);
      this.player.score = round1(this.player.score + scoreEarned);
      this.enemy.hp = Math.max(0, round1(this.enemy.hp - damageDealt));

      result.damageDealt = damageDealt;
      result.coinsEarned = coinsEarned;
      result.scoreEarned = scoreEarned;
      result.comboCount = this.player.combo;
      result.comboBonus = comboBonus;
      result.enemyHpRemaining = this.enemy.hp;

      if (this.enemy.hp <= 0 && !this.enemy.isDefeated) {
        this.enemy.isDefeated = true;
        result.enemyDefeated = true;
        result.reward = this.generateReward();
      }
    } else {
      this.player.wrongCount += 1;
      this.player.combo = 0; // combo resets on wrong answer

      let damageTaken = question.damageToPlayer;
      if (this.player.shield > 0) {
        this.player.shield -= 1;
        damageTaken = 0;
        result.shieldBlocked = true;
      }

      this.player.hp = Math.max(0, this.player.hp - damageTaken);

      result.damageTaken = damageTaken;
      result.comboCount = 0;
      result.correctAnswerText = this._getCorrectAnswerText(question);
      result.explanation = question.explanation || null;
      result.playerHpRemaining = this.player.hp;

      if (this.player.hp <= 0) {
        this.player.isAlive = false;
        result.playerDefeated = true;
      }
    }

    return result;
  }

  _getCorrectAnswerText(question) {
    if (question.type === "multiple_choice") {
      return question.options[question.correctAnswer];
    }
    return question.correctAnswer ? "True" : "False";
  }

  /** Called automatically when enemy.hp reaches 0 */
  generateReward() {
    const isBoss = this.enemy.type === "boss";
    const bonusCoin = isBoss ? 20 : 5;
    const dropKey = isBoss ? true : Math.random() < 0.5; // boss always drops a key
    const dropPowerUp = Math.random() < (isBoss ? 0.75 : 0.3);

    this.player.coin = round1(this.player.coin + bonusCoin);
    if (dropKey) this.player.keys += 1;

    let powerUp = null;
    if (dropPowerUp) {
      const pick = POWER_UP_POOL[Math.floor(Math.random() * POWER_UP_POOL.length)];
      pick.apply(this.player);
      this.player.powerUps.push(pick.name);
      powerUp = pick.name;
    }

    return { key: dropKey, powerUp, bonusCoin };
  }
}

// ---------- Revive / Restart System ----------
const REVIVE_COST = 50;

function reviveWithCoins(player) {
  if (player.coin >= REVIVE_COST) {
    player.coin -= REVIVE_COST;
    player.hp = player.maxHp;
    player.isAlive = true;
    player.combo = 0;
    return true;
  }
  return false;
}

function restartRun(player) {
  player.reset();
  return player;
}

// ---------- Exports (for use in browser / node) ----------
if (typeof module !== "undefined") {
  module.exports = {
    Player, Enemy, CombatEngine, TIER_CONFIG,
    POWER_UP_POOL, reviveWithCoins, restartRun, ENEMY_HP
  };
}
