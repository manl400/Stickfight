const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;
const GROUND_Y = 420;

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particlePool = [];
    this.maxParticles = 100;
    this.screenShake = { x: 0, y: 0, intensity: 0, duration: 0 };
    
    // Initialize particle pool
    for (let i = 0; i < this.maxParticles; i++) {
      this.particlePool.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0,
        color: '#ffffff',
        size: 1,
      });
    }
  }

  render(gameState, renderContext) {
    const { ctx } = this;
    
    // Update screen shake
    this.updateScreenShake(renderContext.deltaTime);
    
    // Apply screen shake
    ctx.save();
    ctx.translate(this.screenShake.x, this.screenShake.y);
    
    // Clear canvas
    ctx.clearRect(-this.screenShake.x, -this.screenShake.y, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Draw background
    this.drawBackground();
    
    // Draw ground
    this.drawGround();
    
    // Draw crates
    gameState.crates.forEach(crate => this.drawCrate(crate));
    
    // Draw players
    this.drawPlayer(gameState.players.p1, 'p1');
    this.drawPlayer(gameState.players.p2, 'p2');
    
    // Draw effects
    gameState.effects.forEach(effect => this.drawEffect(effect));
    
    // Draw UI
    this.drawUI(gameState, renderContext);
    
    // Update particles
    this.updateParticles(renderContext.deltaTime);
    
    // Restore screen shake transform
    ctx.restore();
  }

  drawBackground() {
    const { ctx } = this;
    
    // Sky gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#87CEEB'); // Sky blue
    gradient.addColorStop(1, '#E0F6FF'); // Light blue
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Simple clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    this.drawCloud(150, 100, 60);
    this.drawCloud(400, 80, 80);
    this.drawCloud(700, 120, 70);
  }

  drawCloud(x, y, size) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.3, y, size * 0.7, 0, Math.PI * 2);
    ctx.arc(x - size * 0.3, y, size * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  drawGround() {
    const { ctx } = this;
    
    // Ground
    ctx.fillStyle = '#8B7355'; // Brown ground
    ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
    
    // Grass line
    ctx.fillStyle = '#228B22';
    ctx.fillRect(0, GROUND_Y - 5, CANVAS_WIDTH, 5);
  }

  drawPlayer(player, playerId) {
    const { ctx } = this;
    const { pos, facing, attacking, attackType, hp } = player;
    
    ctx.save();
    ctx.translate(pos.x, pos.y);
    
    // Player color
    const playerColor = playerId === 'p1' ? '#FF4444' : '#4444FF';
    
    // Body (stick figure)
    ctx.strokeStyle = playerColor;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    
    // Head
    ctx.beginPath();
    ctx.arc(0, -50, 12, 0, Math.PI * 2);
    ctx.stroke();
    
    // Body line
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.lineTo(0, -10);
    ctx.stroke();
    
    // Arms
    const armOffset = attacking ? (attackType === 'punch' ? 15 : 20) : 10;
    ctx.beginPath();
    ctx.moveTo(-15, -25);
    ctx.lineTo(facing > 0 ? armOffset : -armOffset, -20);
    ctx.moveTo(15, -25);
    ctx.lineTo(facing > 0 ? armOffset + 10 : -armOffset - 10, -20);
    ctx.stroke();
    
    // Legs
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(-12, 0);
    ctx.moveTo(0, -10);
    ctx.lineTo(12, 0);
    ctx.stroke();
    
    // Attack indicator
    if (attacking) {
      ctx.fillStyle = 'rgba(255, 255, 0, 0.6)';
      const range = attackType === 'kick' ? 40 : 30;
      ctx.beginPath();
      ctx.arc(facing * 25, -25, range, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Bomb ready indicator
    if (player.bombReady) {
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(0, -70, 5, 0, Math.PI * 2);
      ctx.fill();
      
      // Sparkle effect
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-1, -72, 2, 4);
      ctx.fillRect(-2, -71, 4, 2);
    }
    
    ctx.restore();
  }

  drawCrate(crate) {
    const { ctx } = this;
    
    ctx.save();
    ctx.translate(crate.x, crate.y);
    
    // Crate box
    ctx.fillStyle = '#8B4513'; // Brown
    ctx.fillRect(-15, -15, 30, 30);
    
    // Crate details
    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 2;
    ctx.strokeRect(-15, -15, 30, 30);
    
    // Meme symbol
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💥', 0, 0);
    
    ctx.restore();
  }

  drawEffect(effect) {
    const { ctx } = this;
    
    switch (effect.kind) {
      case 'hit':
        this.drawHitEffect(effect);
        break;
      case 'explosion':
        this.drawExplosionEffect(effect);
        break;
      case 'meme_text':
        this.drawMemeText(effect);
        break;
    }
  }

  drawHitEffect(effect) {
    const { ctx } = this;
    const alpha = Math.max(0, effect.ttl / 500);
    
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#FFFF00';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('HIT!', effect.x, effect.y);
    ctx.restore();
  }

  drawExplosionEffect(effect) {
    const { ctx } = this;
    const progress = 1 - (effect.ttl / 1000);
    const radius = progress * 80;
    const alpha = Math.max(0, 1 - progress);
    
    // Trigger screen shake on explosion start
    if (progress < 0.1 && this.screenShake.intensity === 0) {
      this.startScreenShake(8, 500); // intensity 8, duration 500ms
    }
    
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Explosion circle
    const gradient = ctx.createRadialGradient(effect.x, effect.y, 0, effect.x, effect.y, radius);
    gradient.addColorStop(0, '#FF4500');
    gradient.addColorStop(0.5, '#FF8C00');
    gradient.addColorStop(1, 'rgba(255, 140, 0, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Add particles for explosion
    if (progress < 0.2) {
      this.createParticles(effect.x, effect.y, 5, '#FF8C00');
    }
    
    ctx.restore();
  }

  drawMemeText(effect) {
    const { ctx } = this;
    const alpha = Math.max(0, effect.ttl / 2000);
    const y = effect.y - (1 - alpha) * 30; // Float upward
    
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#FF1493'; // Hot pink
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    ctx.strokeText(effect.text, effect.x, y);
    ctx.fillText(effect.text, effect.x, y);
    
    ctx.restore();
  }

  drawUI(gameState, renderContext) {
    const { ctx } = this;
    const { roomCode, connectionType, role } = renderContext;
    
    // HP bars
    this.drawHPBar(gameState.players.p1, 50, 30, 'Player 1');
    this.drawHPBar(gameState.players.p2, CANVAS_WIDTH - 250, 30, 'Player 2');
    
    // Room code
    if (roomCode) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(CANVAS_WIDTH / 2 - 80, 10, 160, 30);
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Room: ${roomCode}`, CANVAS_WIDTH / 2, 25);
    }
    
    // Connection indicator
    if (connectionType) {
      const indicator = connectionType === 'webrtc' ? '🔒 WebRTC' : '⚡ Relay';
      const color = connectionType === 'webrtc' ? '#00FF00' : '#FFFF00';
      
      ctx.fillStyle = color;
      ctx.font = '14px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(indicator, 10, CANVAS_HEIGHT - 25);
    }
  }

  drawHPBar(player, x, y, label) {
    const { ctx } = this;
    const barWidth = 200;
    const barHeight = 20;
    const hpPercent = Math.max(0, player.hp / 100);
    
    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x - 5, y - 5, barWidth + 10, barHeight + 20);
    
    // Label
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x, y - 2);
    
    // HP bar background
    ctx.fillStyle = '#444444';
    ctx.fillRect(x, y + 15, barWidth, barHeight);
    
    // HP bar fill
    const hpColor = hpPercent > 0.6 ? '#00FF00' : hpPercent > 0.3 ? '#FFFF00' : '#FF0000';
    ctx.fillStyle = hpColor;
    ctx.fillRect(x, y + 15, barWidth * hpPercent, barHeight);
    
    // HP text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${player.hp}/100`, x + barWidth / 2, y + 25);
    
    // Bomb ready indicator
    if (player.bombReady) {
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(x + barWidth + 15, y + 25, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('💣', x + barWidth + 15, y + 25);
    }
  }

  updateParticles(deltaTime) {
    // Update active particles
    this.particlePool.forEach(particle => {
      if (!particle.active) return;
      
      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;
      particle.life -= deltaTime;
      
      if (particle.life <= 0) {
        particle.active = false;
      }
    });
    
    // Render particles
    const { ctx } = this;
    this.particlePool.forEach(particle => {
      if (!particle.active) return;
      
      const alpha = particle.life / particle.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  createParticles(x, y, count, color = '#FFFFFF') {
    for (let i = 0; i < count; i++) {
      const particle = this.particlePool.find(p => !p.active);
      if (!particle) break;
      
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = (Math.random() - 0.5) * 200;
      particle.vy = (Math.random() - 0.5) * 200 - 100;
      particle.life = 1 + Math.random() * 2;
      particle.maxLife = particle.life;
      particle.color = color;
      particle.size = 2 + Math.random() * 3;
    }
  }

  updateScreenShake(deltaTime) {
    if (this.screenShake.duration > 0) {
      this.screenShake.duration -= deltaTime * 1000;
      
      if (this.screenShake.duration <= 0) {
        this.screenShake.x = 0;
        this.screenShake.y = 0;
        this.screenShake.intensity = 0;
      } else {
        // Random shake within intensity bounds
        const intensity = this.screenShake.intensity * (this.screenShake.duration / 500);
        this.screenShake.x = (Math.random() - 0.5) * intensity * 2;
        this.screenShake.y = (Math.random() - 0.5) * intensity * 2;
      }
    }
  }

  startScreenShake(intensity, duration) {
    this.screenShake.intensity = intensity;
    this.screenShake.duration = duration;
  }

  destroy() {
    // Cleanup if needed
    this.particlePool = [];
  }
}
