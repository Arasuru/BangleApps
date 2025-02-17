const block = Graphics.createImage(`
########
# # # ##
## # ###
# # ####
## #####
# ######
########
########
`);
const tcols = [ {r:0, g:0, b:1}, {r:0, g:1, b:0}, {r:0, g:1, b:1}, {r:1, g:0, b:0}, {r:1, g:0, b:1}, {r:1, g:1, b:0}, {r:1, g:0.5, b:0.5} ];
const tiles = [
  [[0, 0, 0, 0],
   [0, 0, 0, 0],
   [1, 1, 1, 1],
   [0, 0, 0, 0]],
  [[0, 0, 0],
   [0, 1, 0],
   [1, 1, 1]],
  [[0, 0, 0],
   [1, 0, 0],
   [1, 1, 1]],
  [[0, 0, 0],
   [0, 0, 1],
   [1, 1, 1]],
  [[0, 0, 0],
   [1, 1, 0],
   [0, 1, 1]],
  [[0, 0, 0],
   [0, 1, 1],
   [1, 1, 0]],
  [[1, 1],
   [1, 1]]
];

const ox = 176/2 - 5*8;
const oy = 8;

/* 0 .. simulated arrows
   1 .. drag piece
   2 .. accelerometer. 12 lines record.
   3 .. altimeter
 */
var control = 0, level = 0, lines = 0, score = 0;
var alt_start = -9999; /* For altimeter control */
/* 0 .. menu
   1 .. game
   2 .. game over */
var state = 0;

var pf;

function initGame() {
  pf = Array(23).fill().map(()=>Array(12).fill(0)); // field is really 10x20, but adding a border for collision checks
  pf[20].fill(1);
  pf[21].fill(1);
  pf[22].fill(1);
  pf.forEach((x,i) => { pf[i][0] = 1; pf[i][11] = 1; });
}

function rotateTile(t, r) {
  var nt = JSON.parse(JSON.stringify(t));
  if (t.length==2) return nt;
  var s = t.length;
  for (m=0; m<r; ++m) {
    tl = JSON.parse(JSON.stringify(nt));
    for (i=0; i<s; ++i)
      for (j=0; j<s; ++j)
        nt[i][j] = tl[s-1-j][i];
  }
  return nt;
}

function drawBoundingBox() {
  g.setBgColor(0, 0, 0).clear().setColor(1, 1, 1);
  g.theme.bg = 0;
  for (i=0; i<4; ++i) g.drawRect(ox-i-1, oy-i-1, ox+10*8+i, oy+20*8+i);
}

function drawTile(tile, n, x, y, qClear) {
  if (state != 1) // stops tile from being drawn on the game over screen
    return;
  if (qClear) g.setColor(0);
  else g.setColor(tcols[n].r, tcols[n].g, tcols[n].b);
  for (i=0; i<tile.length; ++i)
    for (j=0; j<tile.length; ++j)
      if (tile[j][i]>0)
        if (qClear) g.fillRect(x+8*i, y+8*j, x+8*(i+1)-1, y+8*(j+1)-1);
        else g.drawImage(block, x+8*i, y+8*j);
}

function showNext(n, r) {
  var nt = rotateTile(tiles[n], r);
  g.setColor(0).fillRect(176-33, 40, 176-33+33, 82);
  drawTile(nt, ntn, 176-33, 40);
}

var time = Date.now();
var px=4, py=0;
var ctn = Math.floor(Math.random()*7); // current tile number
var ntn = Math.floor(Math.random()*7); // next tile number
var ntr = Math.floor(Math.random()*4); // next tile rotation
var ct = rotateTile(tiles[ctn], Math.floor(Math.random()*4)); // current tile (rotated)
var dropInterval;

function calculateSpeed() {
  let step = 500;
  if (level <= 6) // 200-500ms
    step = step - 50*level;
  else if (level <= 13) { // 25-175ms
    step = 200;
    step = step - 25*(level - 6);
  }
  else {
    step = 20; // usually limited by the hardware
    // levels 15+ are programmed to go faster by skipping lines
  }
  print(`level ${level}: drop interval ${step}ms`);
  if (control == 3)
    step = step*2;
  dropInterval = step;
}

function redrawPF(ly) {
  for (y=0; y<=ly; ++y)
    for (x=1; x<11; ++x) {
      c = pf[y][x];
      if (c>0) g.setColor(tcols[c-1].r, tcols[c-1].g, tcols[c-1].b).drawImage(block, ox+(x-1)*8, oy+y*8);
      else g.setColor(0, 0, 0).fillRect(ox+(x-1)*8, oy+y*8, ox+x*8-1, oy+(y+1)*8-1);
    }
}

function gameOver() {
  state = 0;
  g.setColor(1, 1, 1).setFontAlign(0, 1, 0).setFont("Vector",22)
  .drawString("Game Over", 176/2, 76);
  // this cannot allow changing game controls because it would set up duplicate events
  E.showAlert("Game Over").then(startGame, print);
  lines = 0;
  score = 0;
}

function redrawStats(onlyScore) {
  g.setColor(0).fillRect(5, 30, 41, 60)
    .setColor(1, 1, 1).drawString(score.toString(), 22, 50);
  if (!onlyScore) {
      g.setColor(0).fillRect(5, 80, 41, 110)
      .setColor(1, 1, 1).drawString(level.toString(), 22, 100)
      .setColor(0).fillRect(5, 130, 41, 160)
      .setColor(1, 1, 1).drawString(lines.toString(), 22, 150);
  }
}

function insertAndCheck() {
  // stop pieces from falling into each other
  for (let y=0; y<ct.length; ++y)
    for (let x=0; x<ct[y].length; ++x)
      if (ct[y][x]>0) pf[py+y][px+x+1] = ctn+1;
  let clearCount = 0;
  let linesToClear = [];
  let yReal = 19; // the y for display purposes
  // check for full lines
  for (let y=19; y>0; y--) {
    var qFull = true;
    for (let x=1; x<11; ++x) qFull &= pf[y][x]>0;
    if (qFull) {
      clearCount++;
      linesToClear.push([y, yReal]);
      print(`linesToClear.push(${y})`);
      // clear the line, but do not display it yet
      for (ny=y; ny>0; ny--) pf[ny] = JSON.parse(JSON.stringify(pf[ny-1]));
      y++;
    }
    yReal--;
  }
  if (clearCount) {
    lines += clearCount;
    let effectiveLevel = Math.max(level, 1);
    if (clearCount == 1) { // single
      score += 100 * effectiveLevel;
      Bangle.buzz(80, 0.5);
    }
    else if (clearCount == 2) { // double
      score += 300 * effectiveLevel;
      Bangle.buzz(80);
    }
    else if (clearCount == 3) { // triple
      score += 500 * effectiveLevel;
      Bangle.buzz(200);
    }
    else if (clearCount >= 4) { // tetris
      score += 800 * effectiveLevel;
      Bangle.buzz(500);
    }
    // the score will not be shown yet because redrawStats was not called

    // clear effect
    let timer = getTime();
    g.setColor(0, 0, 0);
    while (true) {
      var rectLength = (getTime()-timer)/0.05 + 1;
      if (rectLength > 6)
        break;
      var x1 = 6 - rectLength;
      var x2 = 4 + rectLength;
      for (let line of linesToClear) {
        let y = line[1];
        g.fillRect(ox+x1*8, oy+y*8, ox+x2*8-1, oy+(y+1)*8-1);
      }
      g.flip();
    }
    // display the cleared lines
    for (let line of linesToClear) {
      redrawPF(line[0]);
    }
    if (lines != 0 && lines % 10 == 0) {
      level++;
      calculateSpeed();
    }
    redrawStats();
  }
  // spawn new tile
  px = 4; py = 0;
  ctn = ntn;
  ntn = Math.floor(Math.random()*7);
  ct = rotateTile(tiles[ctn], ntr);
  ntr = Math.floor(Math.random()*4);
  showNext(ntn, ntr);
  if (!moveOk(ct, 0, 0)) {
    gameOver();
  }
}

function moveOk(t, dx, dy) {
  var ok = true;
  for (y=0; y<t.length; ++y)
    for (x=0; x<t[y].length; ++x)
      if (t[y][x]*pf[py+dy+y][px+dx+x+1] > 0) ok = false;
  return ok;
}

function pauseGame() {
  print("Paused");
  state = 3;
}

function resumeGame() {
  print("Resumed");
  state = 1;
}

function gameStep() {
  if (state != 1)
    return;
  if (Date.now()-time > dropInterval) { // drop one step
    time = Date.now();
    if (level >= 15 && moveOk(ct, 0, 2)) {
      // at level 15, pieces drop twile as quickly
      drawTile(ct, ctn, ox+px*8, oy+py*8, true);
      py += 2;
    }
    else if (moveOk(ct, 0, 1)) {
      drawTile(ct, ctn, ox+px*8, oy+py*8, true);
      py++;
    }
    else { // reached the bottom
      insertAndCheck(ct, ctn, px, py);
    }
    drawTile(ct, ctn, ox+px*8, oy+py*8, false);
  }
}

function rotate() {
  t = rotateTile(ct, 3);
  if (moveOk(t, 0, 0)) {
    drawTile(ct, ctn, ox+px*8, oy+py*8, true);
    ct = t;
    drawTile(ct, ctn, ox+px*8, oy+py*8, false);
  }
}

function move(x, y) {
  r = moveOk(ct, x, y);
  if (r) {
    drawTile(ct, ctn, ox+px*8, oy+py*8, true);
    px += x;
    py += y;
    drawTile(ct, ctn, ox+px*8, oy+py*8, false);
  }
  return r;
}

function linear(x) {
  //print("Linear: ", x);
  let now = px / 10;
  if (x < now-0.06)
    move(-1, 0);
  if (x > now+0.06)
    move(1, 0);
}

function newGame() {
  E.showMenu();
  Bangle.setUI({mode : "custom", btn: () => load()});
  if (control == 4) { // Swipe
    Bangle.on("touch", (e) => {
      t = rotateTile(ct, 3);
      if (moveOk(t, 0, 0)) {
        drawTile(ct, ctn, ox+px*8, oy+py*8, true);
        ct = t;
        drawTile(ct, ctn, ox+px*8, oy+py*8, false);
      }
    });

    Bangle.on("swipe", (x,y) => {
      if (y<0) y = 0;
      if (moveOk(ct, x, y)) {
        drawTile(ct, ctn, ox+px*8, oy+py*8, true);
        px += x;
        py += y;
        drawTile(ct, ctn, ox+px*8, oy+py*8, false);
      }
    });
  } else { // control != 4
    if (control == 2) { // Tilt
      Bangle.on("accel", (e) => {
        if (state != 1) return;
        if (control != 2) return;
        print(e.x);
        linear((0.2-e.x) * 2.5);
      });
    }
    if (control == 3) { // Pressure
      Bangle.setBarometerPower(true);
      Bangle.on("pressure", (e) => {
        if (state != 1) return;
        if (control != 3) return;
        let a = e.altitude;
        if (alt_start == -9999)
          alt_start = a;
        a = a - alt_start;
        //print(e.altitude, a);
        linear(a);
      });
    }
    Bangle.on("drag", (e) => {
      let h = 176/2;
      if (state == 2) {
        if (e.b)
          selectGame();
        return;
      }
      if (!e.b)
        return;
      if (state == 0) return;
      if (e.y < h) {
        if (e.x < h)
          rotate();
        else {
          while (move(0, 1)) {
            score++;
            g.flip();
          }
          redrawStats(true);
        }
      } else {
        if (control == 1)
          linear((e.x - 20) / 156);
        if (control != 0)
          return;
        if (e.x < h)
          move(-1, 0);
        else
          move(1, 0);
      }
    });
  }
  setWatch(() => {
    if (state == 1)
      pauseGame();
    else if (state == 3)
      resumeGame();
  }, BTN1, {repeat: true});
  startGame();
}

function startGame() {
  initGame();
  calculateSpeed();
  state = 1;
  drawGame();
  var gi = setInterval(gameStep, 20);
}

function drawGame() {
  drawBoundingBox();
  g.setColor(1, 1, 1).setFontAlign(0, 1, 0)
    .setFont("6x15", 1).drawString("Score", 22, 30)
    .drawString("Level", 22, 80)
    .drawString("Lines", 22, 130)
    .drawString("Next", 176-22, 30);
  redrawStats();
  showNext(ntn, ntr);
}

function selectGame() {
  state = 0;
  print("Game selection menu");

  var menu = {};
  menu["Normal"] = () => { control = 0; newGame(); };
  menu["Drag"] = () => { control = 1; newGame(); };
  menu["Tilt"] = () => { control = 2; newGame(); };
  menu["Pressure"] = () => { control = 3; newGame(); };
  menu["Swipe"] = () => { control = 4; newGame(); };
  level = 1;
  menu["Level"] = {
    value : 1,
    min : 0,
    max : 10,
    wrap : true,
    onchange : (l) => { level = l; }
  };
  E.showMenu(menu);
}

selectGame();
