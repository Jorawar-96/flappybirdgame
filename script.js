// Floppy Bird — Canvas game
// Controls: Space / ArrowUp / Click / Touch to flap. Click READY to start.

(() => {
  // DOM
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const readyBtn = document.getElementById('readyBtn');
  const muteBtn = document.getElementById('muteBtn');
  const gameOverEl = document.getElementById('gameOver');
  const retryBtn = document.getElementById('retryBtn');
  const overlayMsg = document.getElementById('overlayMsg');
  const endScore = document.getElementById('endScore');
  const endBest = document.getElementById('endBest');
  const endTitle = document.getElementById('endTitle');

  // Hi-DPI/responsive
  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const styleW = canvas.clientWidth;
    const styleH = canvas.clientHeight;
    canvas.width = Math.floor(styleW * ratio);
    canvas.height = Math.floor(styleH * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // Game constants
  const GRAVITY = 1100; // px/s^2
  const FLAP_VY = -350; // initial upward velocity on flap
  const PIPE_GAP = 140; // gap between pipes
  const PIPE_W = 60;
  const PIPE_INTERVAL = 1400; // ms
  const PIPE_SPEED = 180; // px/s (base)
  const BIRD_X = 120; // x position of the bird
  const MAX_ROT = Math.PI / 6; // 30 deg up
  const MIN_ROT = -Math.PI / 2.6; // nose dive

  // State
  let width = canvas.clientWidth;
  let height = canvas.clientHeight;
  let bird = null;
  let pipes = [];
  let spawnTimer = 0;
  let running = false;
  let lastTime = 0;
  let score = 0;
  let best = Number(localStorage.getItem('floppy_best') || 0);
  let muted = false;
  let paused = false;

  bestEl.textContent = `Best: ${best}`;

  // Sounds (simple beeps using WebAudio)
  const audioCtx = (window.AudioContext || window.webkitAudioContext) ? new (window.AudioContext || window.webkitAudioContext)() : null;
  function beep(freq, dur=0.07, vol=0.08) {
    if(!audioCtx || muted) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    o.type = 'sine';
    g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  }

  // Init bird
  function reset() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    bird = {
      x: BIRD_X,
      y: Math.floor(height/2),
      vy: 0,
      radius: 18,
      rot: 0,
      alive: true
    };
    pipes = [];
    spawnTimer = 0;
    score = 0;
    running = false;
    lastTime = performance.now();
    scoreEl.textContent = Math.floor(score);
    overlay.classList.remove('hidden');
    gameOverEl.classList.add('hidden');
    overlayMsg.textContent = 'Tap / Click / Press Space to flap';
  }

  // Pipe factory
  function spawnPipe() {
    const minTop = 48;
    const maxTop = height - PIPE_GAP - 120;
    const top = Math.floor(Math.random() * (maxTop - minTop + 1)) + minTop;
    const pipe = {
      x: width + 20,
      top: top,
      bottom: top + PIPE_GAP,
      passed: false
    };
    pipes.push(pipe);
  }

  // Input handlers
  function doFlap() {
    if(!running) {
      // start run on first flap
      running = true;
      lastTime = performance.now();
      requestAnimationFrame(loop);
    }
    if(!bird.alive) return;
    bird.vy = FLAP_VY;
    bird.rot = MAX_ROT;
    beep(900, 0.05, 0.09);
  }

  // Mouse / touch
  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    doFlap();
  });
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    doFlap();
  }, {passive:false});

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if(e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      doFlap();
    }
    if(e.key === 'p') {
      paused = !paused;
      if(!paused && running) {
        lastTime = performance.now();
        requestAnimationFrame(loop);
      }
    }
  });

  // Ready / Retry / Mute buttons
  readyBtn.addEventListener('click', () => {
    overlay.classList.add('hidden');
    running = false;
    lastTime = performance.now();
    // start ambient animation, but wait for user flap to actually start
    requestAnimationFrame(loop);
  });

  retryBtn.addEventListener('click', () => {
    reset();
  });

  muteBtn.addEventListener('click', () => {
    muted = !muted;
    muteBtn.textContent = muted ? 'Unmute' : 'Mute';
    if(!muted && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  });

  // Collision detection AABB vs circle (approx)
  function collidePipe(pipe) {
    const bx = bird.x;
    const by = bird.y;
    const r = bird.radius;
    // top pipe rect: x..x+PIPE_W, y: 0..pipe.top
    // bottom pipe rect: x..x+PIPE_W, y: pipe.bottom..height
    const inX = bx + r > pipe.x && bx - r < pipe.x + PIPE_W;
    if(!inX) return false;
    if(by - r < pipe.top) return true;
    if(by + r > pipe.bottom) return true;
    return false;
  }

  // Game loop
  function loop(now) {
    if(paused) {
      lastTime = now;
      requestAnimationFrame(loop);
      return;
    }
    const dt = Math.min(0.035, (now - lastTime) / 1000);
    lastTime = now;

    // update
    if(running && bird.alive) {
      // bird physics
      bird.vy += GRAVITY * dt;
      bird.y += bird.vy * dt;

      // rotation smoothing: lean down when falling
      const targetRot = clamp(map(bird.vy, -400, 600, MAX_ROT, MIN_ROT), MIN_ROT, MAX_ROT);
      bird.rot += (targetRot - bird.rot) * Math.min(1, dt*8);

      // spawn pipes
      spawnTimer += dt * 1000;
      if(spawnTimer >= PIPE_INTERVAL) {
        spawnTimer = 0;
        spawnPipe();
      }

      // move pipes
      for(let i = pipes.length - 1; i >= 0; i--) {
        const p = pipes[i];
        p.x -= PIPE_SPEED * dt;
        // scoring
        if(!p.passed && p.x + PIPE_W < bird.x) {
          p.passed = true;
          score++;
          scoreEl.textContent = score;
          beep(1200 - Math.min(600, score*30), 0.06, 0.07);
        }
        // remove offscreen
        if(p.x + PIPE_W < -40) pipes.splice(i,1);
      }

      // collisions: with ground/ceiling
      if(bird.y + bird.radius > height - groundHeight()) {
        bird.alive = false; // hit ground
      }
      if(bird.y - bird.radius < 0) {
        bird.y = bird.radius;
        bird.vy = 0;
      }
      // collisions: pipes
      for(const p of pipes) {
        if(collidePipe(p)) {
          bird.alive = false;
          break;
        }
      }

      // on death -> show results after slight pause
      if(!bird.alive) {
        beep(140, 0.3, 0.18);
        endGame();
      }
    } // end running update

    // render
    render();

    // request next
    if(running && bird.alive) {
      requestAnimationFrame(loop);
    }
  }

  // End game
  function endGame() {
    running = false;
    // update best
    if(score > best) {
      best = score;
      localStorage.setItem('floppy_best', best);
      bestEl.textContent = `Best: ${best}`;
    }
    endScore.textContent = `Score: ${score}`;
    endBest.textContent = best;
    endTitle.textContent = score > best ? 'New High Score!' : 'Game Over';
    // show overlay after short delay
    setTimeout(() => {
      gameOverEl.classList.remove('hidden');
    }, 420);
  }

  // render function
  function render() {
    // clear
    ctx.clearRect(0,0,canvas.clientWidth, canvas.clientHeight);

    // sky gradient (already background via CSS; optional subtle)
    // draw clouds (simple)
    drawClouds();

    // pipes
    for(const p of pipes) drawPipe(p);

    // ground
    drawGround();

    // bird
    drawBird();

    // HUD handled by DOM
  }

  // Drawing helpers
  function drawBird() {
    const b = bird;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(-b.rot); // negative because canvas y-down
    // body
    ctx.beginPath();
    ctx.ellipse(0, 0, b.radius+2, b.radius-2, 0, 0, Math.PI*2);
    ctx.fillStyle = '#ffeb6a';
    ctx.fill();
    ctx.strokeStyle = '#e6c93a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // eye
    ctx.beginPath();
    ctx.fillStyle = '#222';
    ctx.arc(6, -4, 3.2, 0, Math.PI*2);
    ctx.fill();

    // wing (simple)
    ctx.beginPath();
    ctx.moveTo(-6, 2);
    ctx.quadraticCurveTo(-18, 0, -8, 10);
    ctx.fillStyle = '#ffd843';
    ctx.fill();

    ctx.restore();
  }

  function drawPipe(p) {
    // top pipe
    ctx.fillStyle = '#3da35a';
    ctx.strokeStyle = '#2b7a42';
    ctx.lineWidth = 3;
    // top rect
    ctx.beginPath();
    ctx.rect(p.x, 0, PIPE_W, p.top);
    ctx.fill();
    ctx.stroke();
    // bottom rect
    ctx.beginPath();
    ctx.rect(p.x, p.bottom, PIPE_W, height - p.bottom - groundHeight());
    ctx.fill();
    ctx.stroke();

    // pipe cap (rounded)
    ctx.fillStyle = '#2f8a4e';
    ctx.beginPath();
    ctx.ellipse(p.x + PIPE_W/2, p.top, PIPE_W/2, 10, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p.x + PIPE_W/2, p.bottom, PIPE_W/2, 10, 0, 0, Math.PI*2);
    ctx.fill();
  }

  // ground height based on canvas height
  function groundHeight() {
    return Math.max(34, Math.round(canvas.clientHeight * 0.12));
  }

  function drawGround() {
    const g = groundHeight();
    ctx.fillStyle = '#de9a3a';
    ctx.fillRect(0, canvas.clientHeight - g, canvas.clientWidth, g);
    // simple stripes
    ctx.fillStyle = '#c8862c';
    for(let i=0;i<canvas.clientWidth;i+=24) {
      ctx.fillRect(i, canvas.clientHeight - g, 12, 6);
    }
  }

  // simple moving clouds for ambience
  let clouds = null;
  function initClouds() {
    clouds = [];
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    for(let i=0;i<6;i++){
      clouds.push({
        x: Math.random()*cw,
        y: Math.random()*ch*0.35,
        w: 60 + Math.random()*120,
        h: 18 + Math.random()*28,
        vx: 8 + Math.random()*18
      });
    }
  }
  function drawClouds() {
    if(!clouds) initClouds();
    ctx.save();
    ctx.globalAlpha = 0.8;
    for(const c of clouds) {
      c.x -= c.vx * 0.016; // move left slowly
      if(c.x + c.w < -20) c.x = canvas.clientWidth + 40;
      // draw cloud
      const grad = ctx.createLinearGradient(c.x, c.y, c.x + c.w, c.y);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(1, 'rgba(255,255,255,0.85)');
      ctx.fillStyle = grad;
      roundRect(ctx, c.x, c.y, c.w, c.h, c.h*0.5);
      ctx.fill();
    }
    ctx.restore();
  }

  // utility: rounded rect
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // small helpers
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function map(v, a, b, A, B) { return A + (v - a) * (B - A) / (b - a); }

  // start
  reset();

  // expose for debugging (optional)
  window.FLOPPY = {
    start: () => { overlay.classList.add('hidden'); running = true; lastTime = performance.now(); requestAnimationFrame(loop); },
    reset
  };

})();
