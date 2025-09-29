// Physics constants from the specification
const GRAVITY = 1500; // px/s^2
const JUMP_VELOCITY = -600; // px/s (negative is up)
const HORIZONTAL_ACCEL = 1200; // px/s^2
const FRICTION = 800; // px/s^2
const MAX_SPEED = 320; // px/s
const GROUND_Y = 420; // Ground level
const ARENA_WIDTH = 960;
const ARENA_HEIGHT = 540;

// Combat constants
const PUNCH_DAMAGE = 6;
const KICK_DAMAGE = 10;
const BOMB_DAMAGE = 12;
const PUNCH_DURATION = 0.12; // seconds
const KICK_DURATION = 0.16; // seconds

// Meme crate spawning
const CRATE_SPAWN_INTERVAL = 6000; // 6 seconds base
const CRATE_SPAWN_VARIANCE = 1000; // +/- 1 second
const CRATE_SPAWN_PROBABILITY = 0.8; // 80%

export class PhysicsEngine {
  constructor() {
    this.nextCrateId = 1;
    this.nextEffectId = 1;
    this.guestInputBuffer = [];
  }

  update(gameState, keys, playerRole, deltaTime) {
    // Update players
    this.updatePlayer(gameState.players.p1, 'p1', keys, playerRole, deltaTime, gameState);
    this.updatePlayer(gameState.players.p2, 'p2', keys, playerRole, deltaTime, gameState);

    // Update effects (reduce TTL)
    gameState.effects = gameState.effects.filter(effect => {
      effect.ttl -= deltaTime * 1000; // Convert to milliseconds
      return effect.ttl > 0;
    });

    // Spawn meme crates
    this.updateCrateSpawning(gameState, deltaTime);

    // Check collisions
    this.checkCollisions(gameState);

    // Only host processes authoritative game logic
    if (playerRole === 'host') {
      this.processHostLogic(gameState, deltaTime);
    }
  }

  updatePlayer(player, playerId, keys, playerRole, deltaTime, gameState) {
    const isLocalPlayer = (playerRole === 'host' && playerId === 'p1') || 
                         (playerRole === 'guest' && playerId === 'p2');
    const isRemoteGuest = (playerRole === 'host' && playerId === 'p2');

    // Process input for local player or remote guest (if host)
    if (isLocalPlayer) {
      this.processPlayerInput(player, keys, playerRole, deltaTime, gameState);
    } else if (isRemoteGuest && this.guestInputBuffer.length > 0) {
      // Apply buffered guest input (host processes guest input)
      const guestInput = this.guestInputBuffer.shift();
      this.processPlayerInput(player, guestInput, 'guest', deltaTime, gameState);
    }

    // Physics simulation for all players
    this.updatePlayerPhysics(player, deltaTime);

    // Update attack timers
    if (player.attackTimer > 0) {
      player.attackTimer -= deltaTime;
      if (player.attackTimer <= 0) {
        player.attacking = false;
        player.attackType = null;
      }
    }
  }

  processPlayerInput(player, keys, playerRole, deltaTime, gameState) {
    const keyMap = playerRole === 'host' ? {
      moveLeft: 'KeyA',
      moveRight: 'KeyD',
      jump: 'KeyW', 
      punch: 'KeyJ',
      kick: 'KeyK',
      memeBomb: 'KeyE',
    } : {
      moveLeft: 'ArrowLeft',
      moveRight: 'ArrowRight', 
      jump: 'ArrowUp',
      punch: 'Digit1',
      kick: 'Digit2',
      memeBomb: 'Digit0',
    };

    // Horizontal movement
    let horizontalAccel = 0;
    if (keys[keyMap.moveLeft]) {
      horizontalAccel = -HORIZONTAL_ACCEL;
      player.facing = -1;
    } else if (keys[keyMap.moveRight]) {
      horizontalAccel = HORIZONTAL_ACCEL;
      player.facing = 1;
    }

    // Apply acceleration
    player.vel.x += horizontalAccel * deltaTime;

    // Apply friction
    if (horizontalAccel === 0 && player.grounded) {
      const frictionForce = FRICTION * deltaTime;
      if (Math.abs(player.vel.x) <= frictionForce) {
        player.vel.x = 0;
      } else {
        player.vel.x -= Math.sign(player.vel.x) * frictionForce;
      }
    }

    // Clamp horizontal velocity
    player.vel.x = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, player.vel.x));

    // Jumping
    if (keys[keyMap.jump] && player.grounded) {
      player.vel.y = JUMP_VELOCITY;
      player.grounded = false;
    }

    // Combat actions
    if (!player.attacking) {
      if (keys[keyMap.punch]) {
        this.startAttack(player, 'punch');
      } else if (keys[keyMap.kick]) {
        this.startAttack(player, 'kick');
      } else if (keys[keyMap.memeBomb] && player.bombReady) {
        this.throwMemeBomb(player, gameState);
      }
    }
  }

  updatePlayerPhysics(player, deltaTime) {
    // Apply gravity
    if (!player.grounded) {
      player.vel.y += GRAVITY * deltaTime;
    }

    // Update position
    player.pos.x += player.vel.x * deltaTime;
    player.pos.y += player.vel.y * deltaTime;

    // Boundary checking
    player.pos.x = Math.max(30, Math.min(ARENA_WIDTH - 30, player.pos.x));

    // Ground collision
    if (player.pos.y >= GROUND_Y) {
      player.pos.y = GROUND_Y;
      player.vel.y = 0;
      player.grounded = true;
    } else {
      player.grounded = false;
    }
  }

  startAttack(player, attackType) {
    player.attacking = true;
    player.attackType = attackType;
    player.attackTimer = attackType === 'punch' ? PUNCH_DURATION : KICK_DURATION;
  }

  throwMemeBomb(player, gameState) {
    if (!player.bombReady) return;
    
    player.bombReady = false;
    
    // Create bomb projectile
    const bombX = player.pos.x + (player.facing * 40);
    const bombY = player.pos.y - 20;
    
    // Immediate explosion for now (could add projectile physics later)
    this.createExplosion(bombX, bombY, gameState);
    
    // Add meme text effect
    const memeTexts = ['BOOM!', 'EPIC!', 'REKT!', 'POGGERS!', 'BASED!', 'YEET!', 'BRUH!'];
    const randomMeme = memeTexts[Math.floor(Math.random() * memeTexts.length)];
    
    this.addEffect(gameState, {
      kind: 'meme_text',
      x: bombX,
      y: bombY - 30,
      ttl: 2000,
      text: randomMeme,
    });
  }

  createExplosion(x, y, gameState) {
    // Add explosion effect
    this.addEffect(gameState, {
      kind: 'explosion',
      x: x,
      y: y,
      ttl: 1000,
    });

    // Check for players in explosion radius
    const explosionRadius = 80;
    const { p1, p2 } = gameState.players;
    
    [p1, p2].forEach(player => {
      const dx = player.pos.x - x;
      const dy = player.pos.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= explosionRadius) {
        // Apply bomb damage and knockback
        player.hp = Math.max(0, player.hp - BOMB_DAMAGE);
        
        // Strong knockback
        const knockbackForce = 500 * (1 - distance / explosionRadius); // Stronger closer to center
        const knockbackX = (dx / distance) * knockbackForce;
        const knockbackY = Math.min(-200, (dy / distance) * knockbackForce - 100); // Always pop up
        
        player.vel.x += knockbackX;
        player.vel.y += knockbackY;
        player.grounded = false;
        
        // Add hit effect
        this.addEffect(gameState, {
          kind: 'hit',
          x: player.pos.x,
          y: player.pos.y - 20,
          ttl: 500,
        });
      }
    });
  }

  updateCrateSpawning(gameState, deltaTime) {
    const now = Date.now();
    const timeSinceLastSpawn = now - gameState.lastCrateSpawn;
    
    // Check if it's time to potentially spawn a crate
    const spawnInterval = CRATE_SPAWN_INTERVAL + (Math.random() - 0.5) * 2 * CRATE_SPAWN_VARIANCE;
    
    if (timeSinceLastSpawn >= spawnInterval && Math.random() < CRATE_SPAWN_PROBABILITY) {
      // Don't spawn if there's already a crate
      if (gameState.crates.length === 0) {
        this.spawnMemeCrate(gameState);
      }
      gameState.lastCrateSpawn = now;
    }
  }

  spawnMemeCrate(gameState) {
    const crate = {
      id: `crate_${this.nextCrateId++}`,
      x: 200 + Math.random() * 560, // Spawn in middle area
      y: GROUND_Y,
      type: 'meme',
    };
    
    gameState.crates.push(crate);
  }

  checkCollisions(gameState) {
    const { p1, p2 } = gameState.players;

    // Player vs player combat
    if (this.checkPlayerCollision(p1, p2)) {
      this.resolvePlayerCombat(p1, p2, gameState);
    }

    // Player vs crates
    gameState.crates = gameState.crates.filter(crate => {
      if (this.checkPlayerCrateCollision(p1, crate)) {
        this.collectCrate(p1, crate, gameState);
        return false;
      }
      if (this.checkPlayerCrateCollision(p2, crate)) {
        this.collectCrate(p2, crate, gameState);
        return false;
      }
      return true;
    });
  }

  checkPlayerCollision(p1, p2) {
    const dx = p1.pos.x - p2.pos.x;
    const dy = p1.pos.y - p2.pos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < 60; // Player collision radius
  }

  checkPlayerCrateCollision(player, crate) {
    const dx = player.pos.x - crate.x;
    const dy = player.pos.y - crate.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < 40; // Crate pickup radius
  }

  resolvePlayerCombat(p1, p2, gameState) {
    // Check if p1 is attacking p2
    if (p1.attacking && this.isAttackHitting(p1, p2)) {
      this.applyDamage(p2, p1.attackType, gameState, p1);
      p1.attacking = false; // Prevent multi-hit
    }

    // Check if p2 is attacking p1  
    if (p2.attacking && this.isAttackHitting(p2, p1)) {
      this.applyDamage(p1, p2.attackType, gameState, p2);
      p2.attacking = false; // Prevent multi-hit
    }
  }

  isAttackHitting(attacker, target) {
    // Simple facing-based hit detection
    const dx = target.pos.x - attacker.pos.x;
    return (attacker.facing > 0 && dx > 0) || (attacker.facing < 0 && dx < 0);
  }

  applyDamage(target, attackType, gameState, attacker) {
    let damage = 0;
    let knockback = 0;

    switch (attackType) {
      case 'punch':
        damage = PUNCH_DAMAGE;
        knockback = 150;
        break;
      case 'kick':
        damage = KICK_DAMAGE;
        knockback = 250;
        break;
      case 'bomb':
        damage = BOMB_DAMAGE;
        knockback = 400;
        break;
    }

    target.hp = Math.max(0, target.hp - damage);

    // Apply knockback
    const direction = target.pos.x > attacker.pos.x ? 1 : -1;
    target.vel.x += direction * knockback;
    if (target.grounded) {
      target.vel.y = -200; // Pop up slightly
      target.grounded = false;
    }

    // Add hit effect
    this.addEffect(gameState, {
      kind: 'hit',
      x: target.pos.x,
      y: target.pos.y - 20,
      ttl: 500,
    });
  }

  collectCrate(player, crate, gameState) {
    if (crate.type === 'meme') {
      player.bombReady = true;
      
      // Add meme text effect
      const memeTexts = ['BOOM!', 'EPIC!', 'REKT!', 'POGGERS!', 'BASED!'];
      const randomMeme = memeTexts[Math.floor(Math.random() * memeTexts.length)];
      
      this.addEffect(gameState, {
        kind: 'meme_text',
        x: player.pos.x,
        y: player.pos.y - 40,
        ttl: 2000,
        text: randomMeme,
      });
    }
  }

  addEffect(gameState, effectData) {
    const effect = {
      id: `effect_${this.nextEffectId++}`,
      ...effectData,
    };
    gameState.effects.push(effect);
  }

  processHostLogic(gameState, deltaTime) {
    // Host-only logic like authoritative state updates
    // This is where networking sync would happen
  }

  // Add guest input to buffer (called when host receives guest input)
  addGuestInput(inputState) {
    this.guestInputBuffer.push(inputState);
    // Keep buffer reasonable size
    if (this.guestInputBuffer.length > 10) {
      this.guestInputBuffer.shift();
    }
  }

  // Convert key codes to input state for networking
  getInputStateFromKeys(keys, role) {
    const keyMap = role === 'host' ? {
      moveLeft: 'KeyA',
      moveRight: 'KeyD',
      jump: 'KeyW',
      punch: 'KeyJ',
      kick: 'KeyK',
      memeBomb: 'KeyE',
    } : {
      moveLeft: 'ArrowLeft',
      moveRight: 'ArrowRight',
      jump: 'ArrowUp',
      punch: 'Digit1',
      kick: 'Digit2',
      memeBomb: 'Digit0',
    };

    const inputState = {};
    Object.keys(keyMap).forEach(action => {
      inputState[keyMap[action]] = !!keys[keyMap[action]];
    });

    return inputState;
  }
}
