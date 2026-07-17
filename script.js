// ============================================================
// Connection setup
// ============================================================
let ESP32_IP = "192.168.4.1";
const JOYSTICK_POLL_MS = 60; // fast polling for responsive jump input

const ipInput     = document.getElementById('espIp');
const saveIpBtn   = document.getElementById('saveIp');
const connStatus  = document.getElementById('connStatus');
const rawXEl      = document.getElementById('rawX');
const rawYEl      = document.getElementById('rawY');
const jumpThresholdEl = document.getElementById('jumpThreshold');

ipInput.value = ESP32_IP;

// ------------------------------------------------------------
// Joystick calibration
// ------------------------------------------------------------
// Raw ADC values range 0-4095. Resting/neutral position is usually
// around 2048, but varies per joystick. Adjust these if needed:
//
// If tilting the joystick UP does NOT trigger a jump, your hardware's
// "up" direction likely INCREASES the Y value instead of decreasing it.
// In that case, swap the comparison in isTiltedUp() below (change
// "< JUMP_THRESHOLD" to "> JUMP_THRESHOLD" and adjust the number).
const JUMP_THRESHOLD = 1200;   // Y must drop below this to count as "tilted up"
const RESET_THRESHOLD = 1800;  // Y must rise above this before another jump can trigger
jumpThresholdEl.textContent = JUMP_THRESHOLD;

let joystickArmed = true; // true = ready to trigger a jump on next tilt-up

function isTiltedUp(y) {
  return y < JUMP_THRESHOLD; // flip to "y > JUMP_THRESHOLD" if your wiring is inverted
}

function baseUrl(){
  return `http://${ESP32_IP}`;
}

function setConnStatus(ok, message){
  connStatus.textContent = message;
  connStatus.classList.toggle('ok', ok);
  connStatus.classList.toggle('err', !ok);
}

let joystickTimer = null;

async function pollJoystick(){
  try{
    const res = await fetch(`${baseUrl()}/joystick/state`);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    rawXEl.textContent = data.x;
    rawYEl.textContent = data.y;
    setConnStatus(true, `Connected · reading joystick (${ESP32_IP})`);

    // Edge-triggered jump: only fires once per tilt, must return to
    // neutral before it can fire again (prevents holding tilt = infinite jumps)
    if (isTiltedUp(data.y) && joystickArmed) {
      joystickArmed = false;
      triggerJump();
    } else if (data.y > RESET_THRESHOLD) {
      joystickArmed = true;
    }
  }catch(err){
    setConnStatus(false, `Could not reach ESP32 at ${ESP32_IP}. Check the IP and that you're connected to its WiFi network.`);
  }
}

function startJoystickPolling(){
  if (joystickTimer) clearInterval(joystickTimer);
  pollJoystick();
  joystickTimer = setInterval(pollJoystick, JOYSTICK_POLL_MS);
}

saveIpBtn.addEventListener('click', () => {
  const val = ipInput.value.trim();
  if(val){
    ESP32_IP = val;
    startJoystickPolling();
  }
});
ipInput.addEventListener('keydown', (e) => {
  if(e.key === 'Enter') saveIpBtn.click();
});

startJoystickPolling();

// ============================================================
// Dino Runner Game
// ============================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('gameOverlay');
const overlayTitle = document.getElementById('overlayTitle');
const scoreValueEl = document.getElementById('scoreValue');
const highScoreValueEl = document.getElementById('highScoreValue');

const GROUND_Y = 190;
const GRAVITY = 0.9;
const JUMP_VELOCITY = -14;

let dino, obstacles, score, highScore, speed, isRunning, isGameOver, frame;

function resetGame(){
  dino = { x: 60, y: GROUND_Y - 32, w: 28, h: 32, vy: 0, onGround: true };
  obstacles = [];
  score = 0;
  speed = 6;
  frame = 0;
  isRunning = false;
  isGameOver = false;
  scoreValueEl.textContent = '0';
  overlay.classList.remove('hidden');
  overlayTitle.textContent = "Press Space or tilt joystick up to start";
}

function triggerJump(){
  if (isGameOver) {
    resetGame();
    startGame();
    return;
  }
  if (!isRunning) {
    startGame();
    return;
  }
  if (dino.onGround) {
    dino.vy = JUMP_VELOCITY;
    dino.onGround = false;
  }
}

function startGame(){
  isRunning = true;
  overlay.classList.add('hidden');
}

function spawnObstacleMaybe(){
  const minGap = Math.max(55, 110 - Math.floor(speed * 3));
  if (frame % minGap === 0) {
    const h = 24 + Math.floor(Math.random() * 20);
    obstacles.push({ x: canvas.width, y: GROUND_Y - h, w: 16 + Math.floor(Math.random()*10), h });
  }
}

function update(){
  frame++;
  score += 0.12;
  speed = 6 + score / 150;

  // dino physics
  dino.vy += GRAVITY;
  dino.y += dino.vy;
  if (dino.y >= GROUND_Y - dino.h) {
    dino.y = GROUND_Y - dino.h;
    dino.vy = 0;
    dino.onGround = true;
  }

  // obstacles
  spawnObstacleMaybe();
  obstacles.forEach(o => o.x -= speed);
  obstacles = obstacles.filter(o => o.x + o.w > 0);

  // collision detection
  for (const o of obstacles) {
    if (
      dino.x < o.x + o.w &&
      dino.x + dino.w > o.x &&
      dino.y < o.y + o.h &&
      dino.y + dino.h > o.y
    ) {
      endGame();
      break;
    }
  }

  scoreValueEl.textContent = Math.floor(score);
}

function endGame(){
  isRunning = false;
  isGameOver = true;
  if (Math.floor(score) > highScore) {
    highScore = Math.floor(score);
    highScoreValueEl.textContent = highScore;
  }
  overlay.classList.remove('hidden');
  overlayTitle.textContent = `Game over — score ${Math.floor(score)}. Press Space or tilt up to retry`;
}

function draw(){
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ground line
  ctx.strokeStyle = '#54605a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(canvas.width, GROUND_Y);
  ctx.stroke();

  // dino
  ctx.fillStyle = '#2c3833';
  ctx.fillRect(dino.x, dino.y, dino.w, dino.h);

  // obstacles (cacti)
  ctx.fillStyle = '#3a5c3f';
  obstacles.forEach(o => {
    ctx.fillRect(o.x, o.y, o.w, o.h);
  });
}

function loop(){
  if (isRunning) update();
  draw();
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------
// Keyboard controls (Space bar) — lets you test without hardware
// ------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    triggerJump();
  }
});

// init
highScore = 0;
resetGame();
loop();
