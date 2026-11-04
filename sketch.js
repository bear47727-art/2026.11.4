// 動畫與測驗設定：調整精靈影格、答題數量、反應時間和畫面效果。
const WALK_FRAME_COUNT = 8;
const WALK_FRAME_HEIGHT = 39;
const FRAME_DURATION = 100;
const QUESTION_COUNT = 6;
const JUMP_FRAME_COUNT = 10;
const JUMP_FRAME_HEIGHT = 42;
const CELEBRATION_JUMP_DURATION = 1600;
const CELEBRATION_FIREWORK_INTERVAL = 360;
const ELECTRIC_FRAME_COUNT = 8;
const ELECTRIC_FRAME_HEIGHT = 41;
const ACTION_FRAME_DURATION = 140;
const WRONG_JUMP_COUNT = 3;
const WRONG_JUMP_DURATION = 1800;
const SCREEN_SHAKE_DURATION = 260;
const SCREEN_SHAKE_STRENGTH = 18;
const IDLE_HINTS = [
  '慢慢來，你一定做得到！',
  '點喇叭聽聽題目吧！',
  '找一找最適合的答案。',
  '答對一題，真棒！',
  '別著急，再想一想。',
  '你是生活小高手！'
];
const CONFETTI_COLORS = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#b388eb', '#ff9f1c'];

// 素材與題庫狀態：保存圖片、完整題庫、目前題目和題庫錯誤訊息。
let walkSprite;
let jumpSprite;
let electricSprite;
let questionPool = [];
let questionBankError = '';
let currentQuestions = [];
let optionOrder = [];
let completedQuestions = [];
let firstTryResults = [];

// 精靈位置與拖曳狀態：記錄角色座標、移動方向和答案拖曳資訊。
let characterX;
let characterY;
let characterHomeX;
let characterHomeY;
let facingDirection = 1;
let draggingOption = -1;
let dragOffsetX = 0;
let dragOffsetY = 0;
let interactionOrigin = null;
let returningHome = false;

// 精靈待機狀態：控制角色閒置時的移動、動作和提示泡泡。
let idleTargetX = null;
let nextIdleMoveAt = 0;
let idleActionUntil = 0;
let nextIdleActionAt = 0;
let idleHintIndex = 0;
let nextHintAt = 0;
let actorHint = '';
let actorHintUntil = 0;

// 答題反應狀態：控制答對慶祝、答錯反應和畫面震動。
let celebrationState = '';
let celebrationStartedAt = 0;
let celebrationUntil = 0;
let nextFireworkAt = 0;
let fireworkSide = 1;
let wrongReactionState = '';
let wrongReactionUntil = 0;
let wrongJumpStartedAt = 0;
let wrongJumpStartX = 0;
let wrongJumpStartY = 0;
let wrongJumpEndX = 0;
let wrongJumpEndY = 0;
let screenShakeUntil = 0;

// 測驗流程與動畫粒子：保存作答進度、封面狀態與各種慶祝效果。
let feedback = '聽聽題目，再把右側答案拖到相符的題目';
let feedbackIsCorrect = false;
let roundComplete = false;
let quizStarted = false;
let confetti = [];
let candyParticles = [];
let fireworkParticles = [];
let celebrationConfetti = [];

// 預先載入精靈圖片與 CSV 題庫，避免畫面開始繪製後才讀取資源。
function preload() {
  walkSprite = loadImage('1/walk/walk..png');
  jumpSprite = loadImage('1/jump/jump..png');
  electricSprite = loadImage('1/電到/Electricity arrives..png');
  loadStrings('question_bank.csv', (lines) => {
    const result = parseQuestionBank(lines);
    if (result.error) {
      questionBankError = result.error;
      console.error(`題庫載入失敗：${questionBankError}`);
      return;
    }
    questionPool = result.questions;
  }, (error) => {
    questionBankError = '無法讀取 question_bank.csv，請確認題庫檔案存在。';
    console.error(questionBankError, error);
  });
}

// 建立畫布、設定文字與精靈起始位置，並初始化第一輪題目。
function setup() {
  createCanvas(windowWidth, windowHeight);
  imageMode(CENTER);
  textFont('sans-serif');
  characterHomeX = 46;
  characterHomeY = height - 42;
  characterX = characterHomeX;
  characterY = characterHomeY;
  nextIdleMoveAt = millis() + 500;
  nextIdleActionAt = millis() + 5000;
  nextHintAt = millis() + 5500;
  startNewRound();
}

// 開始新一輪：隨機抽六題、打亂選項，並清除上一輪的進度與動畫。
function startNewRound() {
  if (questionPool.length < QUESTION_COUNT) {
    questionBankError = questionBankError || `題庫至少需要 ${QUESTION_COUNT} 題，目前只有 ${questionPool.length} 題。`;
    console.error(`無法開始測驗：${questionBankError}`);
    return;
  }
  currentQuestions = shuffleItems(questionPool).slice(0, QUESTION_COUNT);
  optionOrder = shuffleItems(currentQuestions.map((question, index) => index));
  completedQuestions = currentQuestions.map(() => false);
  firstTryResults = currentQuestions.map(() => null);
  roundComplete = false;
  confetti = [];
  candyParticles = [];
  fireworkParticles = [];
  celebrationConfetti = [];
  celebrationState = '';
  wrongReactionState = '';
  returningHome = false;
  idleTargetX = null;
  wrongReactionUntil = 0;
  screenShakeUntil = 0;
  actorHint = '';
  actorHintUntil = 0;
  feedback = '聽聽題目，再把右側答案拖到相符的題目';
  feedbackIsCorrect = false;
  idleHintIndex = floor(random(IDLE_HINTS.length));
  nextHintAt = millis() + 5500;
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

// 使用 Fisher–Yates 演算法打亂陣列，回傳新陣列而不修改原資料。
function shuffleItems(items) {
  const shuffled = items.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = floor(random(index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

// 讀取並驗證題庫：檢查欄位、題數，以及題目和答案是否重複。
function parseQuestionBank(lines) {
  const rows = lines.join('\n').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (rows.length === 0 || rows[0].trim() !== 'question,answer') {
    return { questions: [], error: 'CSV 標題必須是 question,answer。' };
  }

  const questions = [];
  const seenQuestions = new Set();
  const seenAnswers = new Set();
  for (let index = 1; index < rows.length; index += 1) {
    const columns = parseCsvRow(rows[index]);
    if (!columns || columns.length !== 2 || !columns[0] || !columns[1]) {
      return { questions: [], error: `CSV 第 ${index + 1} 行格式錯誤，請提供題目和答案兩欄。` };
    }
    if (seenQuestions.has(columns[0])) {
      return { questions: [], error: `CSV 第 ${index + 1} 行的題目重複，請修改後再試。` };
    }
    if (seenAnswers.has(columns[1])) {
      return { questions: [], error: `CSV 第 ${index + 1} 行的答案重複，配對題目需要不同答案。` };
    }
    seenQuestions.add(columns[0]);
    seenAnswers.add(columns[1]);
    questions.push({ question: columns[0], answer: columns[1] });
  }

  if (questions.length < QUESTION_COUNT) {
    return { questions: [], error: `題庫目前有 ${questions.length} 題，至少需要 ${QUESTION_COUNT} 題。` };
  }
  return { questions, error: '' };
}

// 解析單行 CSV，支援以雙引號包住的欄位和欄位內逗號。
function parseCsvRow(line) {
  const columns = [];
  let value = '';
  let insideQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === ',' && !insideQuotes) {
      columns.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  if (insideQuotes) {
    return null;
  }
  columns.push(value.trim());
  return columns;
}

// p5.js 每幀呼叫的主繪圖函式：依序顯示錯誤、封面或答題畫面。
function draw() {
  if (questionBankError) {
    background('#bde0fe');
    drawQuestionBankError();
    return;
  }
  if (!quizStarted) {
    drawCover();
    return;
  }

  const layout = getLayout();
  background('#bde0fe');
  updateCharacterMotion();

  const shakeOffset = getScreenShakeOffset();
  push();
  translate(shakeOffset.x, shakeOffset.y);
  drawHeader(layout);
  drawQuestionRows(layout);
  drawOptionRows(layout);
  drawFeedback(layout);
  drawCandyParticles();
  drawFireworkParticles();
  drawCelebrationConfetti();
  if (draggingOption === -1 && (!roundComplete || celebrationState === 'jumping')
      && (!celebrationState || celebrationState === 'jumping')
      && !returningHome && !wrongReactionState && height >= 500) {
    drawCharacterSpeechBubble();
  }
  drawCharacter(draggingOption !== -1 || returningHome || idleTargetX !== null);
  pop();

  if (roundComplete) {
    if (!celebrationState && !returningHome) {
      drawResults();
    }
  }
}

// 繪製封面版面，依螢幕大小配置標題、角色、對話框和開始按鈕。
function drawCover() {
  drawCoverBackground();

  const compact = width < 600;
  const shortScreen = height < 500;
  const titleY = height * (shortScreen ? 0.16 : 0.17);
  const subtitleY = titleY + (shortScreen ? 39 : 52);
  const characterYOnCover = height * (shortScreen ? 0.75 : 0.76);
  const characterSize = min(shortScreen ? 68 : 112, max(58, min(width * 0.2, height * 0.16)));
  const characterRange = max(0, min(width * 0.22, width / 2 - characterSize / 2 - 16));
  const characterPhase = millis() / 1800;
  const characterXOnCover = width / 2 + sin(characterPhase) * characterRange;
  const bubbleWidth = min(compact ? width - 32 : 390, width * (compact ? 0.84 : 0.48));
  const bubbleHeight = shortScreen ? 50 : compact ? 58 : 68;
  const bubbleX = constrain(characterXOnCover - bubbleWidth * 0.34, 12, width - bubbleWidth - 12);
  const bubbleY = max(
    subtitleY + (shortScreen ? 54 : 62),
    characterYOnCover - characterSize * 0.56 - bubbleHeight - (shortScreen ? 18 : 24)
  );
  const button = getStartButton();

  drawCoverDecorations();
  noStroke();
  fill('#457b9d');
  textAlign(CENTER, CENTER);
  textSize(min(16, max(11, width * 0.035)));
  text('✨ 趣味生活學習 ✨', width / 2, titleY - (shortScreen ? 28 : 36));
  fill('#1d3557');
  textSize(min(compact ? 34 : 50, max(25, width * 0.09)));
  text('生活小常識', width / 2, titleY);
  fill('#457b9d');
  textSize(min(compact ? 15 : 19, max(11, width * 0.04)));
  text('生活習慣、安全常識、居家整理，隨機挑戰六題！', width / 2, subtitleY);

  drawCoverSpeechBubble(bubbleX, bubbleY, bubbleWidth, bubbleHeight, characterXOnCover);
  drawCoverActivityCards(compact, shortScreen);
  drawCoverCharacter(characterXOnCover, characterYOnCover, characterSize, characterPhase);
  drawStartButton(button);
}

// 畫出封面的天空、地面和雲朵背景。
function drawCoverBackground() {
  noStroke();
  for (let band = 0; band < 12; band += 1) {
    const bandHeight = height / 12 + 1;
    const skyColor = lerpColor(color('#e0f6ff'), color('#bde0fe'), band / 11);
    fill(skyColor);
    rect(0, band * bandHeight, width, bandHeight);
  }

  noStroke();
  fill('#a8dadc');
  ellipse(width * 0.12, height * 1.03, width * 0.85, height * 0.48);
  fill('#95d5b2');
  ellipse(width * 0.88, height * 1.04, width * 0.92, height * 0.52);
  fill('#c7f0c2');
  rect(0, height * 0.84, width, height * 0.16);

  drawCoverCloud(width * 0.18, height * 0.34, 0.8);
  drawCoverCloud(width * 0.83, height * 0.3, 0.65);
}

// 以多個圓形組合成雲朵，可指定位置和縮放比例。
function drawCoverCloud(x, y, scaleFactor) {
  push();
  translate(x, y);
  scale(scaleFactor);
  noStroke();
  fill(255, 255, 255, 205);
  ellipse(0, 10, 78, 28);
  ellipse(-22, 3, 36, 34);
  ellipse(2, -7, 45, 46);
  ellipse(27, 4, 34, 30);
  pop();
}

// 繪製封面會閃爍的星點和兩側花朵裝飾。
function drawCoverDecorations() {
  const twinkle = 0.75 + sin(millis() / 330) * 0.25;
  noStroke();
  fill(255, 209, 102, 210 * twinkle);
  circle(width * 0.83, height * 0.16, 22 + twinkle * 5);
  fill('#fff4bd');
  circle(width * 0.83, height * 0.16, 14);

  const decorations = [
    [0.12, 0.52, 13], [0.88, 0.56, 16], [0.72, 0.23, 10],
    [0.19, 0.72, 9], [0.93, 0.76, 11], [0.06, 0.25, 10]
  ];
  for (const [xRatio, yRatio, size] of decorations) {
    const pulse = 0.8 + sin(millis() / 500 + xRatio * 8) * 0.2;
    fill('#ffffff');
    circle(width * xRatio, height * yRatio, size * pulse);
    fill('#ffd166');
    circle(width * xRatio, height * yRatio, size * 0.42 * pulse);
  }

  drawCoverFlower(width * 0.12, height * 0.88, 1);
  drawCoverFlower(width * 0.88, height * 0.9, 0.8);
}

// 在指定位置繪製可縮放的小花。
function drawCoverFlower(x, y, scaleFactor) {
  push();
  translate(x, y);
  scale(scaleFactor);
  stroke('#4d9078');
  strokeWeight(3);
  line(0, 7, 0, 30);
  noStroke();
  fill('#ff9f9c');
  for (let petal = 0; petal < 5; petal += 1) {
    const angle = petal * TWO_PI / 5;
    circle(cos(angle) * 8, sin(angle) * 8, 9);
  }
  fill('#ffd166');
  circle(0, 0, 8);
  fill('#52b788');
  ellipse(-5, 23, 12, 6);
  ellipse(6, 27, 12, 6);
  pop();
}

// 繪製封面邀請對話，泡泡尾端會朝向精靈的位置。
function drawCoverSpeechBubble(x, y, bubbleWidth, bubbleHeight, characterXOnCover) {
  push();
  drawingContext.shadowColor = 'rgba(29, 53, 87, 0.16)';
  drawingContext.shadowBlur = 18;
  drawingContext.shadowOffsetY = 7;
  stroke('#ffffff');
  strokeWeight(3);
  fill('#fffdf5');
  rect(x, y, bubbleWidth, bubbleHeight, 24);
  drawingContext.shadowColor = 'transparent';
  noStroke();
  fill('#fffdf5');
  const tailX = constrain(characterXOnCover, x + 32, x + bubbleWidth - 32);
  triangle(tailX - 12, y + bubbleHeight - 3, tailX + 12, y + bubbleHeight - 3, tailX, y + bubbleHeight + 20);
  fill('#e07a5f');
  textAlign(CENTER, CENTER);
  textSize(min(24, max(17, bubbleWidth * 0.07)));
  text('快來測驗看看呀！', x + bubbleWidth / 2, y + bubbleHeight / 2);
  pop();
}

// 顯示聽題、配答案和得驚喜三個玩法提示卡。
function drawCoverActivityCards(compact, shortScreen) {
  const cardY = height * (shortScreen ? 0.39 : 0.4);
  const cardWidth = compact ? min(104, width * 0.29) : 126;
  const cardHeight = compact ? 36 : 42;
  const cardGap = compact ? 7 : 12;
  const labels = ['🎧 聽題目', '🧩 配答案', '🌟 得驚喜'];
  const totalWidth = cardWidth * labels.length + cardGap * (labels.length - 1);
  const startX = (width - totalWidth) / 2;

  textAlign(CENTER, CENTER);
  textSize(compact ? 11 : 14);
  for (let index = 0; index < labels.length; index += 1) {
    const cardX = startX + index * (cardWidth + cardGap);
    noStroke();
    fill(255, 255, 255, 225);
    rect(cardX, cardY, cardWidth, cardHeight, 18);
    fill('#1d3557');
    text(labels[index], cardX + cardWidth / 2, cardY + cardHeight / 2);
  }
}

// 顯示封面精靈：依時間切換走路／跳躍影格，並沿畫面移動。
function drawCoverCharacter(x, y, size, phase) {
  const jumping = millis() % 6200 >= 4200 && millis() % 6200 < 5600;
  const sprite = jumping ? jumpSprite : walkSprite;
  if (!sprite) {
    return;
  }
  const frameCount = jumping ? JUMP_FRAME_COUNT : WALK_FRAME_COUNT;
  const frameHeight = jumping ? JUMP_FRAME_HEIGHT : WALK_FRAME_HEIGHT;
  const cycleTime = millis() % 6200;
  const jumpProgress = constrain((cycleTime - 4200) / 1400, 0, 1);
  const frameIndex = jumping
    ? min(frameCount - 1, floor(jumpProgress * frameCount))
    : floor(millis() / FRAME_DURATION) % frameCount;
  const sourceX = Math.floor(frameIndex * sprite.width / frameCount);
  const sourceRight = Math.floor((frameIndex + 1) * sprite.width / frameCount);
  const facing = cos(phase) >= 0 ? 1 : -1;
  const bounce = jumping ? sin(jumpProgress * PI) * size * 0.34 : 0;

  push();
  noStroke();
  fill(255, 255, 255, 125);
  ellipse(x, y + size * 0.34, size * 0.9, size * 0.16);
  translate(x, y - bounce);
  scale(facing, 1);
  image(
    sprite,
    0,
    0,
    size,
    size,
    sourceX,
    0,
    sourceRight - sourceX,
    frameHeight
  );
  pop();
}

// 計算封面開始按鈕的位置與尺寸，供繪圖和點擊判定共用。
function getStartButton() {
  const buttonWidth = min(width - 40, 300);
  const buttonHeight = min(58, max(48, height * 0.085));
  return {
    x: (width - buttonWidth) / 2,
    y: height * 0.91 - buttonHeight / 2,
    width: buttonWidth,
    height: buttonHeight
  };
}

// 繪製封面上的「開始測驗」按鈕。
function drawStartButton(button) {
  push();
  noStroke();
  fill('#2d8d6f');
  rect(button.x, button.y + 5, button.width, button.height, 22);
  fill('#06a77d');
  rect(button.x, button.y, button.width, button.height, 22);
  fill('#ffffff');
  textAlign(CENTER, CENTER);
  textSize(min(21, max(17, button.width * 0.07)));
  text('開始測驗  ➜', button.x + button.width / 2, button.y + button.height / 2 - 1);
  pop();
}

// 題庫無法載入或格式不正確時，顯示清楚的錯誤訊息。
function drawQuestionBankError() {
  noStroke();
  fill('#1d3557');
  textAlign(CENTER, CENTER);
  textSize(min(20, max(14, width * 0.04)));
  text('題庫無法載入', width / 2, height / 2 - 20);
  textSize(min(14, max(10, width * 0.028)));
  text(questionBankError, width / 2, height / 2 + 16, width - 32, 60);
}

// 更新答題畫面中的精靈移動、慶祝、答錯和返回原位狀態。
function updateCharacterMotion() {
  const now = millis();
  if (draggingOption !== -1) {
    const followX = constrain(mouseX, 36, width - 36);
    const followY = constrain(mouseY - 48, 36, height - 36);
    facingDirection = followX >= characterX ? 1 : -1;
    characterX = followX;
    characterY = followY;
    returningHome = false;
    return;
  }

  if (celebrationState === 'jumping') {
    if (now >= nextFireworkAt) {
      createFireworkBurst(
        constrain(width / 2 + fireworkSide * random(width * 0.1, width * 0.16), 24, width - 24),
        height - random(100, 145)
      );
      fireworkSide *= -1;
      nextFireworkAt = now + CELEBRATION_FIREWORK_INTERVAL;
    }
    if (now >= celebrationUntil) {
      celebrationState = '';
      returningHome = true;
    }
    return;
  }

  if (wrongReactionState === 'jumpingToHome') {
    const progress = constrain((now - wrongJumpStartedAt) / WRONG_JUMP_DURATION, 0, 1);
    const easedProgress = progress * progress * (3 - 2 * progress);
    characterX = lerp(wrongJumpStartX, wrongJumpEndX, easedProgress);
    characterY = lerp(wrongJumpStartY, wrongJumpEndY, easedProgress)
      - abs(sin(progress * PI * WRONG_JUMP_COUNT)) * min(90, height * 0.16);
    if (abs(characterX - wrongJumpStartX) > 1) {
      facingDirection = wrongJumpEndX >= wrongJumpStartX ? 1 : -1;
    }
    if (progress === 1) {
      characterX = wrongJumpEndX;
      characterY = wrongJumpEndY;
      wrongReactionState = 'electric';
      wrongReactionUntil = now + ELECTRIC_FRAME_COUNT * ACTION_FRAME_DURATION;
    }
    return;
  }

  if (returningHome) {
    const previousX = characterX;
    characterX = moveTowards(characterX, characterHomeX, 7);
    characterY = moveTowards(characterY, characterHomeY, 7);
    if (characterX !== previousX) {
      facingDirection = characterX > previousX ? 1 : -1;
    }
    if (characterX === characterHomeX && characterY === characterHomeY) {
      returningHome = false;
      idleTargetX = null;
      nextIdleMoveAt = now + 600;
    }
    return;
  }

  if (wrongReactionState === 'electric' && now >= wrongReactionUntil) {
    wrongReactionState = '';
    actorHint = '被電到啦！再看看題目，答案還在等你喔。';
    actorHintUntil = now + 5000;
  }

  if (!roundComplete && !wrongReactionState) {
    updateIdleCharacter();
  }
}

// 根據答錯後的剩餘時間，計算本幀畫面的震動偏移量。
function getScreenShakeOffset() {
  if (millis() >= screenShakeUntil) {
    return { x: 0, y: 0 };
  }
  const strength = SCREEN_SHAKE_STRENGTH * (screenShakeUntil - millis()) / SCREEN_SHAKE_DURATION;
  return {
    x: sin(millis() * 0.16) * strength,
    y: cos(millis() * 0.19) * strength * 0.7
  };
}

// 依畫布尺寸計算題目、選項和頁尾版面，支援桌機與窄螢幕。
function getLayout() {
  const compact = width < 600;
  const margin = compact ? max(8, width * 0.025) : 18;
  const gap = compact ? 8 : 14;
  const maxContentWidth = compact ? 560 : min(1000, max(760, width * 0.9));
  const contentWidth = min(width - margin * 2, maxContentWidth);
  const contentX = (width - contentWidth) / 2;
  const optionWidth = min(contentWidth * 0.36, compact ? 148 : 340);
  const leftWidth = contentWidth - gap - optionWidth;
  const rowTop = height < 500 ? 78 : compact ? 94 : 112;
  const footerHeight = height < 500 ? 100 : compact ? 150 : 160;
  const rowGap = compact ? 4 : 8;
  const availableRowHeight = (height - rowTop - footerHeight - rowGap * 5) / QUESTION_COUNT;
  const rowHeight = max(min(30, availableRowHeight), min(compact ? 88 : 76, availableRowHeight));
  const targetWidth = min(leftWidth * (compact ? 0.46 : 0.35), compact ? 108 : 150);
  const answerHeight = getAnswerHeight(rowHeight, compact);
  const speakerSize = compact
    ? min(28, max(10, rowHeight - answerHeight - 8))
    : min(34, max(20, rowHeight - 8));
  const questionX = contentX;
  const optionX = contentX + leftWidth + gap;
  const optionHeight = rowHeight - (compact ? 4 : 6);
  const footerTop = rowTop + QUESTION_COUNT * rowHeight + (QUESTION_COUNT - 1) * rowGap;

  return {
    compact,
    contentWidth,
    margin,
    gap,
    rowTop,
    rowGap,
    rowHeight,
    questionX,
    leftWidth,
    optionX,
    optionWidth,
    optionHeight,
    targetWidth,
    speakerSize,
    optionCellWidth: optionWidth,
    characterHomeY: height - 42,
    footerTop
  };
}

// 繪製測驗標題與題目區、答案區的欄位提示。
function drawHeader(layout) {
  noStroke();
  fill('#1d3557');
  textAlign(CENTER, CENTER);
  const titleY = height < 500 ? 19 : layout.compact ? 25 : 31;
  const subtitleY = titleY + (height < 500 ? 22 : 31);
  textSize(min(layout.compact ? 23 : 27, max(height < 500 ? 15 : 18, width * 0.045)));
  text('生活小常識', width / 2, titleY);
  textSize(min(14, max(height < 500 ? 9 : 11, width * 0.025)));
  text('隨機六題配對挑戰', width / 2, subtitleY);

  fill('#457b9d');
  textAlign(CENTER, CENTER);
  textSize(layout.compact ? 9 : 12);
  text('點擊喇叭聽題目', layout.questionX + layout.leftWidth / 2, layout.rowTop - 12);
  textAlign(CENTER, CENTER);
  text('答案選項', layout.optionX + layout.optionWidth / 2, layout.rowTop - 12);
}

// 逐列繪製題目卡片和對應的答案放置區。
function drawQuestionRows(layout) {
  for (let index = 0; index < QUESTION_COUNT; index += 1) {
    const questionRect = getQuestionRect(layout, index);
    drawCard(questionRect, completedQuestions[index] ? '#d8f3dc' : '#ffffff', false);
    drawQuestionContent(layout, index, questionRect);
  }
}

// 在題目卡片中繪製題目文字、語音按鈕和答案放置框。
function drawQuestionContent(layout, index, row) {
  const answerRect = getAnswerRect(layout, index);
  const speakerRect = getSpeakerRect(layout, index);
  const questionFontSize = layout.compact ? min(10, max(8, row.height * 0.14)) : min(13, max(10, row.height * 0.2));
  const questionCenterY = layout.compact
    ? row.y + (row.height - answerRect.height - 8) / 2
    : row.y + row.height / 2;
  noStroke();
  fill('#457b9d');
  textAlign(LEFT, CENTER);
  textSize(questionFontSize);
  text(`${index + 1}.`, row.x + 7, questionCenterY);

  const questionTextX = row.x + 26;
  const questionTextEnd = speakerRect.x - 5;
  const textWidth = max(24, questionTextEnd - questionTextX);
  fill('#1d3557');
  textSize(questionFontSize);
  if (layout.compact) {
    textAlign(LEFT, CENTER);
    text(
      currentQuestions[index].question,
      questionTextX,
      row.y + 2,
      textWidth,
      max(10, row.height - answerRect.height - 11)
    );
  } else {
    text(
      currentQuestions[index].question,
      questionTextX,
      row.y + 4,
      textWidth,
      row.height - 8
    );
  }

  drawSpeakerButton(speakerRect);
  drawCard(answerRect, completedQuestions[index] ? '#d8f3dc' : '#f8fbff', !completedQuestions[index]);
  fill(completedQuestions[index] ? '#2d6a4f' : '#7b8794');
  textAlign(CENTER, CENTER);
  textSize(layout.compact ? min(10, max(8, answerRect.height * 0.36)) : min(12, max(9, row.height * 0.18)));
  text(completedQuestions[index] ? currentQuestions[index].answer : '放答案', answerRect.x + answerRect.width / 2, answerRect.y + answerRect.height / 2);
}

// 取得指定題目列的矩形座標與尺寸。
function getQuestionRect(layout, index) {
  return {
    x: layout.questionX,
    y: layout.rowTop + index * (layout.rowHeight + layout.rowGap),
    width: layout.leftWidth,
    height: layout.rowHeight
  };
}

// 取得指定題目的答案放置框位置。
function getAnswerRect(layout, index) {
  const row = getQuestionRect(layout, index);
  const answerHeight = getAnswerHeight(row.height, layout.compact);
  return {
    x: layout.compact ? row.x + row.width - layout.targetWidth - 6 : row.x + row.width - layout.targetWidth - 5,
    y: layout.compact ? row.y + row.height - answerHeight - 4 : row.y + 4,
    width: layout.targetWidth,
    height: layout.compact ? answerHeight : row.height - 8
  };
}

// 依題目列高度和窄螢幕狀態計算答案框高度。
function getAnswerHeight(rowHeight, compact) {
  if (!compact) {
    return rowHeight - 8;
  }
  const minimumHeight = rowHeight < 48 ? rowHeight * 0.28 : 19;
  return min(28, max(minimumHeight, rowHeight * 0.34));
}

// 計算指定題目的喇叭按鈕位置。
function getSpeakerRect(layout, index) {
  const row = getQuestionRect(layout, index);
  const answer = getAnswerRect(layout, index);
  return {
    x: layout.compact ? row.x + row.width - layout.speakerSize - 6 : answer.x - layout.speakerSize - 5,
    y: layout.compact ? row.y + 4 : row.y + (row.height - layout.speakerSize) / 2,
    width: layout.speakerSize,
    height: layout.speakerSize
  };
}

// 繪製可點擊的喇叭圖示。
function drawSpeakerButton(button) {
  push();
  translate(button.x + button.width / 2, button.y + button.height / 2);
  noStroke();
  fill('#e9f4ff');
  stroke('#457b9d');
  strokeWeight(1.5);
  circle(0, 0, button.width);
  noStroke();
  fill('#1d3557');
  rectMode(CENTER);
  rect(-button.width * 0.12, 0, button.width * 0.14, button.height * 0.26, 2);
  triangle(
    -button.width * 0.03, -button.height * 0.19,
    button.width * 0.13, -button.height * 0.32,
    button.width * 0.13, button.height * 0.32
  );
  noFill();
  stroke('#1d3557');
  strokeWeight(1.2);
  arc(button.width * 0.02, 0, button.width * 0.38, button.height * 0.52, -PI / 3, PI / 3);
  pop();
}

// 依隨機順序繪製尚未配對的答案卡，並顯示答案文字和圖示。
function drawOptionRows(layout) {
  for (let index = 0; index < optionOrder.length; index += 1) {
    const questionIndex = optionOrder[index];
    if (completedQuestions[questionIndex] && draggingOption !== questionIndex) {
      continue;
    }

    const optionRect = getOptionRect(layout, questionIndex);
    const option = optionRect;
    drawCard(option, draggingOption === questionIndex ? '#d8f3fc' : '#fff3d6', false);
    drawOptionIllustration(currentQuestions[questionIndex].answer, option);
    noStroke();
    fill('#1d3557');
    textAlign(CENTER, CENTER);
    textSize(min(layout.compact ? 11 : 14, max(8, option.height * 0.18)));
    text(
      currentQuestions[questionIndex].answer,
      option.x + option.width * 0.39,
      option.y + 3,
      option.width * 0.58,
      option.height - 6
    );
  }
}

// 依答案內容選擇對應圖示；洗手圖示會循環呈現搓泡泡與沖水。
function drawOptionIllustration(answer, option) {
  const centerX = option.x + option.width * 0.23;
  const centerY = option.y + option.height / 2;
  const size = min(option.height * 0.64, option.width * 0.25);
  // 根據答案關鍵字選圖示；找不到對應種類時使用星星作為預設圖示。
  const iconType = answer.includes('洗手') ? 'washHands'
      : answer.includes('玩具') ? 'toy'
        : answer.includes('洗臉') ? 'face'
          : answer.includes('牙') ? 'toothbrush'
          : answer.includes('口鼻') ? 'face'
            : answer.includes('大人的手') ? 'hands'
              : answer.includes('水') ? 'water'
                : answer.includes('垃圾桶') ? 'bin'
                  : answer.includes('停下來') ? 'stop'
                    : answer.includes('衛生紙') ? 'tissue'
                      : answer.includes('帽子') ? 'hat'
                        : answer.includes('慢慢走') ? 'shoe'
                          : answer.includes('睡衣') || answer.includes('外套') ? 'clothes'
                            : answer.includes('沖馬桶') ? 'toilet'
                              : answer.includes('水果') ? 'fruit'
                                : answer.includes('擦乾身體') ? 'tissue' : 'star';

  push();
  const iconMotion = millis() / 360;
  translate(centerX, centerY + sin(iconMotion) * min(size * 0.035, 2.5));
  scale(1 + sin(iconMotion * 0.8) * 0.025);
  noStroke();
  // 洗手動畫分成搓泡泡與沖水兩個階段，雙手會依階段移動。
  if (iconType === 'washHands') {
    const rinseProgress = (millis() % 3000) / 3000;
    const rinsing = rinseProgress > 0.58;
    const handOffset = rinsing ? 0 : sin(millis() / 100) * size * 0.055;

    if (rinsing) {
      stroke('#4cc9f0');
      strokeWeight(max(1, size * 0.035));
      for (let drop = 0; drop < 3; drop += 1) {
        const dropX = (drop - 1) * size * 0.2;
        const dropY = -size * 0.48 + ((millis() / 7 + drop * 13) % (size * 0.5));
        line(dropX, dropY, dropX - size * 0.025, dropY + size * 0.08);
      }
      noStroke();
      fill('#90e0ef');
      arc(0, -size * 0.42, size * 0.46, size * 0.24, PI, TWO_PI, CHORD);
    } else {
      fill('#ffffff');
      for (let bubble = 0; bubble < 4; bubble += 1) {
        const bubbleX = cos(millis() / 260 + bubble * HALF_PI) * size * 0.3;
        const bubbleY = -size * 0.25 - (millis() / 12 + bubble * 11) % (size * 0.3);
        circle(bubbleX, bubbleY, size * (0.09 + bubble % 2 * 0.035));
      }
      noFill();
      stroke('#bde0fe');
      strokeWeight(max(1, size * 0.035));
      circle(0, -size * 0.3, size * 0.2);
      noStroke();
    }

    fill('#f4a261');
    ellipse(-size * 0.17 - handOffset, size * 0.08, size * 0.28, size * 0.44);
    ellipse(size * 0.17 + handOffset, size * 0.08, size * 0.28, size * 0.44);
    fill('#ffd166');
    ellipse(-size * 0.17 - handOffset, -size * 0.1, size * 0.25, size * 0.31);
    ellipse(size * 0.17 + handOffset, -size * 0.1, size * 0.25, size * 0.31);
    fill('#4cc9f0');
    ellipse(0, size * 0.36, size * 0.56, size * 0.12);
  // 其餘分支依序繪製牙刷、牽手、玩具、臉、水滴和生活用品圖案。
  } else if (iconType === 'toothbrush') {
    fill('#ef476f');
    rectMode(CENTER);
    rect(0, size * 0.12, size * 0.18, size * 0.76, 5);
    fill('#06a77d');
    rect(0, -size * 0.3, size * 0.32, size * 0.28, 4);
    fill('#ffffff');
    for (let tooth = -1; tooth <= 1; tooth += 1) {
      rect(tooth * size * 0.09, -size * 0.34, size * 0.035, size * 0.13, 1);
    }
  } else if (iconType === 'hands') {
    fill('#ffd166');
    circle(-size * 0.14, -size * 0.12, size * 0.34);
    circle(size * 0.14, -size * 0.12, size * 0.34);
    fill('#f4a261');
    rectMode(CENTER);
    rect(0, size * 0.16, size * 0.42, size * 0.4, 8);
    fill('#4cc9f0');
    circle(-size * 0.34, -size * 0.34, size * 0.12);
    circle(size * 0.34, -size * 0.38, size * 0.1);
  } else if (iconType === 'toy') {
    rectMode(CENTER);
    fill('#ff6b6b');
    rect(-size * 0.18, size * 0.1, size * 0.42, size * 0.42, 5);
    fill('#ffd166');
    rect(size * 0.2, size * 0.1, size * 0.42, size * 0.42, 5);
    fill('#4cc9f0');
    circle(-size * 0.18, -size * 0.18, size * 0.22);
    fill('#06a77d');
    circle(size * 0.2, -size * 0.18, size * 0.22);
  } else if (iconType === 'face') {
    fill('#ffd6a5');
    circle(0, 0, size * 0.72);
    fill('#1d3557');
    circle(-size * 0.15, -size * 0.08, size * 0.06);
    circle(size * 0.15, -size * 0.08, size * 0.06);
    noFill();
    stroke('#ef476f');
    strokeWeight(2);
    arc(0, size * 0.04, size * 0.27, size * 0.2, 0, PI);
    noStroke();
    fill('#4cc9f0');
    circle(size * 0.35, -size * 0.3, size * 0.12);
  } else if (iconType === 'water') {
    fill('#4cc9f0');
    beginShape();
    vertex(0, -size * 0.48);
    bezierVertex(size * 0.55, size * 0.08, size * 0.32, size * 0.48, 0, size * 0.48);
    bezierVertex(-size * 0.32, size * 0.48, -size * 0.55, size * 0.08, 0, -size * 0.48);
    endShape(CLOSE);
    fill('#ffffff');
    ellipse(-size * 0.12, size * 0.1, size * 0.1, size * 0.23);
  } else if (iconType === 'bin') {
    rectMode(CENTER);
    fill('#4cc9f0');
    rect(0, size * 0.08, size * 0.58, size * 0.62, 5);
    fill('#1d3557');
    rect(0, -size * 0.3, size * 0.68, size * 0.1, 4);
    fill('#ffffff');
    rect(-size * 0.16, size * 0.08, size * 0.035, size * 0.38, 2);
    rect(0, size * 0.08, size * 0.035, size * 0.38, 2);
    rect(size * 0.16, size * 0.08, size * 0.035, size * 0.38, 2);
  } else if (iconType === 'stop') {
    fill('#ef476f');
    beginShape();
    for (let point = 0; point < 8; point += 1) {
      const angle = -PI / 8 + point * TWO_PI / 8;
      vertex(cos(angle) * size * 0.44, sin(angle) * size * 0.44);
    }
    endShape(CLOSE);
    fill('#ffffff');
    rectMode(CENTER);
    rect(0, 0, size * 0.38, size * 0.09, 3);
  } else if (iconType === 'tissue') {
    rectMode(CENTER);
    fill('#bde0fe');
    rect(0, size * 0.12, size * 0.72, size * 0.48, 7);
    fill('#ffffff');
    ellipse(0, -size * 0.08, size * 0.28, size * 0.42);
    fill('#90e0ef');
    ellipse(size * 0.03, -size * 0.08, size * 0.1, size * 0.22);
  } else if (iconType === 'hat') {
    fill('#ff9f1c');
    arc(0, 0, size * 0.78, size * 0.72, PI, TWO_PI, CHORD);
    ellipse(0, size * 0.12, size * 0.95, size * 0.2);
    fill('#e76f51');
    rectMode(CENTER);
    rect(0, -size * 0.1, size * 0.08, size * 0.28, 3);
  } else if (iconType === 'shoe') {
    fill('#06a77d');
    rectMode(CENTER);
    rect(-size * 0.05, size * 0.04, size * 0.42, size * 0.28, 8);
    ellipse(size * 0.18, size * 0.12, size * 0.46, size * 0.22);
    fill('#ffffff');
    rect(-size * 0.1, -size * 0.05, size * 0.18, size * 0.04, 2);
    rect(-size * 0.08, size * 0.02, size * 0.16, size * 0.04, 2);
  } else if (iconType === 'clothes') {
    fill('#b388eb');
    beginShape();
    vertex(-size * 0.2, -size * 0.35);
    vertex(-size * 0.42, -size * 0.18);
    vertex(-size * 0.3, size * 0.02);
    vertex(-size * 0.2, -size * 0.04);
    vertex(-size * 0.2, size * 0.38);
    vertex(size * 0.2, size * 0.38);
    vertex(size * 0.2, -size * 0.04);
    vertex(size * 0.3, size * 0.02);
    vertex(size * 0.42, -size * 0.18);
    vertex(size * 0.2, -size * 0.35);
    endShape(CLOSE);
  } else if (iconType === 'toilet') {
    rectMode(CENTER);
    fill('#90e0ef');
    rect(0, -size * 0.2, size * 0.48, size * 0.34, 5);
    fill('#caf0f8');
    rect(0, size * 0.12, size * 0.58, size * 0.2, 8);
    ellipse(0, size * 0.27, size * 0.48, size * 0.3);
  } else if (iconType === 'fruit') {
    fill('#ff6b6b');
    circle(-size * 0.16, size * 0.08, size * 0.48);
    fill('#ffd166');
    circle(size * 0.19, size * 0.1, size * 0.46);
    fill('#06a77d');
    ellipse(size * 0.04, -size * 0.22, size * 0.24, size * 0.12);
  } else {
    fill('#ffd166');
    beginShape();
    for (let point = 0; point < 10; point += 1) {
      const angle = -HALF_PI + point * PI / 5;
      const radius = point % 2 === 0 ? size * 0.46 : size * 0.2;
      vertex(cos(angle) * radius, sin(angle) * radius);
    }
    endShape(CLOSE);
  }
  pop();
}

// 取得答案卡位置；拖曳中的選項則跟隨滑鼠座標。
function getOptionRect(layout, questionIndex) {
  if (draggingOption === questionIndex) {
    return {
      x: mouseX - dragOffsetX,
      y: mouseY - dragOffsetY,
      width: layout.optionCellWidth,
      height: layout.optionHeight
    };
  }
  const row = optionOrder.indexOf(questionIndex);
  return {
    x: layout.optionX,
    y: layout.rowTop + row * (layout.rowHeight + layout.rowGap) + (layout.rowHeight - layout.optionHeight) / 2,
    width: layout.optionCellWidth,
    height: layout.optionHeight
  };
}

// 繪製一般卡片或帶有虛線框的答案放置區。
function drawCard(card, color, isDropZone) {
  push();
  rectMode(CORNER);
  stroke(isDropZone ? '#457b9d' : '#a8b7c7');
  strokeWeight(isDropZone ? 2 : 1);
  if (isDropZone) {
    drawingContext.setLineDash([5, 4]);
  }
  fill(color);
  rect(card.x, card.y, card.width, card.height, 11);
  drawingContext.setLineDash([]);
  pop();
}

// 顯示目前提示訊息與已完成題數。
function drawFeedback(layout) {
  const solvedCount = completedQuestions.filter(Boolean).length;
  noStroke();
  fill(feedbackIsCorrect ? '#2d6a4f' : '#52616b');
  textAlign(CENTER, CENTER);
  textSize(min(layout.compact ? 12 : 14, max(8, min(width * 0.025, height * 0.027))));
  const footerSpace = height - layout.footerTop;
  const compactFooter = height < 500;
  const feedbackY = layout.footerTop + min(compactFooter ? 2 : 22, footerSpace * 0.22);
  text(`${feedback}　(${solvedCount}/${QUESTION_COUNT})`, layout.margin, feedbackY, width - layout.margin * 2, compactFooter ? 18 : 24);
}

// 按照目前狀態繪製走路、跳躍或答錯時的精靈影格。
function drawCharacter(isMoving) {
  const isCelebrating = celebrationState === 'jumping';
  const isShocked = wrongReactionState === 'electric';
  const isJumping = draggingOption === -1
    && (wrongReactionState === 'jumpingToHome' || isCelebrating || (!returningHome && celebrationState === '' && !isShocked && millis() < idleActionUntil));
  const sprite = isShocked ? electricSprite : isJumping ? jumpSprite : walkSprite;
  const frameCount = isShocked ? ELECTRIC_FRAME_COUNT : isJumping ? JUMP_FRAME_COUNT : WALK_FRAME_COUNT;
  const frameHeight = isShocked ? ELECTRIC_FRAME_HEIGHT : isJumping ? JUMP_FRAME_HEIGHT : WALK_FRAME_HEIGHT;
  let frameIndex = isMoving || isJumping || isShocked ? floor(millis() / FRAME_DURATION) % frameCount : 0;
  if (wrongReactionState === 'jumpingToHome') {
    const hopDuration = WRONG_JUMP_DURATION / WRONG_JUMP_COUNT;
    frameIndex = floor(((millis() - wrongJumpStartedAt) % hopDuration) / (hopDuration / JUMP_FRAME_COUNT));
  } else if (isShocked) {
    frameIndex = min(ELECTRIC_FRAME_COUNT - 1, floor((millis() - (wrongReactionUntil - ELECTRIC_FRAME_COUNT * ACTION_FRAME_DURATION)) / ACTION_FRAME_DURATION));
  }
  const sourceX = Math.floor(frameIndex * sprite.width / frameCount);
  const sourceRight = Math.floor((frameIndex + 1) * sprite.width / frameCount);
  const sourceWidth = sourceRight - sourceX;
  const celebrationProgress = isCelebrating
    ? constrain((millis() - celebrationStartedAt) / CELEBRATION_JUMP_DURATION, 0, 1)
    : 0;
  const jumpOffset = wrongReactionState === 'jumpingToHome'
    ? 0
    : isCelebrating
      ? -sin(celebrationProgress * PI) * min(90, height * 0.16)
      : isJumping ? -abs(sin((millis() / 550) * PI)) * 22 : 0;
  const enlarged = wrongReactionState === 'jumpingToHome' || isShocked || isCelebrating ? 1.65 : 1;

  push();
  translate(characterX, characterY + jumpOffset);
  scale(facingDirection * enlarged, enlarged);
  image(sprite, 0, 0, isShocked ? 82 : 68, isShocked ? 82 : 68, sourceX, 0, sourceWidth, frameHeight);
  pop();
}

// 精靈閒置時定期走動、做動作，並輪換鼓勵提示。
function updateIdleCharacter() {
  const now = millis();
  const leftLimit = min(45, width / 2);
  const rightLimit = max(width - 45, width / 2);
  characterHomeY = height - 42;
  characterY = characterHomeY;

  if (now >= nextHintAt) {
    idleHintIndex = (idleHintIndex + 1 + floor(random(IDLE_HINTS.length - 1))) % IDLE_HINTS.length;
    nextHintAt = now + 5000 + random(2500);
  }

  if (now >= nextIdleActionAt) {
    idleActionUntil = now + 1100;
    nextIdleActionAt = now + 9000 + random(7000);
  }

  if (idleTargetX === null && now >= nextIdleMoveAt) {
    let targetX = random(leftLimit, rightLimit);
    if (abs(targetX - characterX) < 70 && width > 180) {
      targetX = targetX < width / 2 ? rightLimit : leftLimit;
    }
    idleTargetX = targetX;
  }

  if (idleTargetX !== null) {
    const previousX = characterX;
    characterX = moveTowards(characterX, idleTargetX, 1.4);
    if (characterX !== previousX) {
      facingDirection = characterX > previousX ? 1 : -1;
    }
    if (characterX === idleTargetX) {
      idleTargetX = null;
      nextIdleMoveAt = now + 900 + random(1800);
    }
  }
}

// 在答題畫面精靈旁顯示目前的提示對話。
function drawCharacterSpeechBubble() {
  const bubbleWidth = min(280, width - 24);
  const bubbleHeight = 42;
  const gap = 22;
  const bubbleX = constrain(
    characterX < width / 2 ? characterX + gap : characterX - gap - bubbleWidth,
    12,
    width - bubbleWidth - 12
  );
  const bubbleY = max(10, characterY - bubbleHeight - 22);

  push();
  stroke('#457b9d');
  strokeWeight(2);
  fill('#fffdf5');
  rect(bubbleX, bubbleY, bubbleWidth, bubbleHeight, 15);
  noStroke();
  fill('#fffdf5');
  const tailX = constrain(characterX, bubbleX + 18, bubbleX + bubbleWidth - 18);
  triangle(tailX - 8, bubbleY + bubbleHeight - 2, tailX + 8, bubbleY + bubbleHeight - 2, tailX, bubbleY + bubbleHeight + 10);
  noStroke();
  fill('#1d3557');
  textAlign(CENTER, CENTER);
  textSize(min(14, max(9, bubbleWidth * 0.05)));
  const hint = actorHint && millis() < actorHintUntil ? actorHint : IDLE_HINTS[idleHintIndex];
  text(hint, bubbleX + 8, bubbleY + 3, bubbleWidth - 16, bubbleHeight - 6);
  pop();
}

// 答對時在答案位置建立糖果粒子爆發。
function createCandyBurst(x, y) {
  for (let index = 0; index < 32; index += 1) {
    const angle = random(TWO_PI);
    const speed = random(2, 7);
    candyParticles.push({
      x,
      y,
      velocityX: cos(angle) * speed,
      velocityY: sin(angle) * speed - random(1, 4),
      size: random(8, 14),
      spin: random(-0.15, 0.15),
      rotation: random(TWO_PI),
      color: random(CONFETTI_COLORS),
      life: 1
    });
  }
}

// 更新並繪製糖果粒子，移除生命值耗盡的粒子。
function drawCandyParticles() {
  noStroke();
  for (const candy of candyParticles) {
    candy.x += candy.velocityX;
    candy.y += candy.velocityY;
    candy.velocityY += 0.16;
    candy.velocityX *= 0.99;
    candy.rotation += candy.spin;
    candy.life -= 0.012;

    push();
    translate(candy.x, candy.y);
    rotate(candy.rotation);
    fill(0, 0, 0, 35);
    ellipse(1, 2, candy.size * 1.25, candy.size * 0.8);
    const candyColor = color(candy.color);
    candyColor.setAlpha(255 * candy.life);
    fill(candyColor);
    ellipse(0, 0, candy.size, candy.size * 0.7);
    triangle(-candy.size * 0.43, 0, -candy.size * 0.68, -candy.size * 0.18, -candy.size * 0.68, candy.size * 0.18);
    triangle(candy.size * 0.43, 0, candy.size * 0.68, -candy.size * 0.18, candy.size * 0.68, candy.size * 0.18);
    fill(255, 255, 255, 150);
    ellipse(-candy.size * 0.12, -candy.size * 0.1, candy.size * 0.22, candy.size * 0.12);
    pop();
  }
  candyParticles = candyParticles.filter((candy) => candy.life > 0 && candy.y < height + 24);
}

// 在指定位置建立煙火粒子。
function createFireworkBurst(x, y) {
  const colorValue = random(CONFETTI_COLORS);
  for (let index = 0; index < 28; index += 1) {
    const angle = TWO_PI * index / 28 + random(-0.08, 0.08);
    const speed = random(1.8, 4.2);
    fireworkParticles.push({
      x,
      y,
      velocityX: cos(angle) * speed,
      velocityY: sin(angle) * speed,
      size: random(5, 8),
      color: colorValue,
      life: 1
    });
  }
}

// 建立從畫面邊緣飛入的慶祝彩帶。
function createCelebrationConfetti() {
  for (let index = 0; index < 64; index += 1) {
    const edge = floor(random(3));
    const x = edge === 0 ? random(0, width * 0.12)
      : edge === 1 ? random(width * 0.88, width)
        : random(width);
    const y = edge === 2 ? random(0, height * 0.12) : random(height * 0.18, height * 0.9);
    celebrationConfetti.push({
      x,
      y,
      velocityX: random(-1.5, 1.5) + (x < width * 0.12 ? 1 : x > width * 0.88 ? -1 : 0),
      velocityY: random(0.7, 2.4),
      size: random(6, 11),
      rotation: random(TWO_PI),
      spin: random(-0.1, 0.1),
      color: random(CONFETTI_COLORS),
      life: 1
    });
  }
}

// 更新並繪製答對時飛入的彩帶。
function drawCelebrationConfetti() {
  noStroke();
  for (const piece of celebrationConfetti) {
    piece.x += piece.velocityX;
    piece.y += piece.velocityY;
    piece.rotation += piece.spin;
    piece.life -= 0.012;

    push();
    translate(piece.x, piece.y);
    rotate(piece.rotation);
    const pieceColor = color(piece.color);
    pieceColor.setAlpha(255 * piece.life);
    fill(pieceColor);
    rectMode(CENTER);
    rect(0, 0, piece.size, piece.size * 0.65, 2);
    pop();
  }
  celebrationConfetti = celebrationConfetti.filter((piece) => piece.life > 0);
}

// 更新並繪製煙火粒子，並清除已消散的粒子。
function drawFireworkParticles() {
  noStroke();
  for (const particle of fireworkParticles) {
    particle.x += particle.velocityX;
    particle.y += particle.velocityY;
    particle.velocityY += 0.035;
    particle.velocityX *= 0.985;
    particle.velocityY *= 0.985;
    particle.life -= 0.025;

    const particleColor = color(particle.color);
    particleColor.setAlpha(255 * particle.life);
    stroke(particleColor);
    strokeWeight(max(1, particle.size * 0.24));
    line(
      particle.x - particle.velocityX * 2,
      particle.y - particle.velocityY * 2,
      particle.x,
      particle.y
    );
    noStroke();
    fill(particleColor);
    circle(particle.x, particle.y, particle.size * particle.life);
    fill(255, 255, 255, 210 * particle.life);
    circle(particle.x, particle.y, particle.size * 0.28 * particle.life);
  }
  fireworkParticles = fireworkParticles.filter((particle) => particle.life > 0);
}

// 顯示成績遮罩、首次答對分數、答對率和兩個後續按鈕。
function drawResults() {
  const score = firstTryResults.filter(Boolean).length;
  const percentage = Math.round(score / QUESTION_COUNT * 100);
  if (percentage > 60) {
    drawConfetti();
  }

  push();
  noStroke();
  fill(29, 53, 87, 105);
  rect(0, 0, width, height);
  const panelWidth = min(width - 32, 430);
  const panelHeight = min(height - 40, 340);
  const panelX = (width - panelWidth) / 2;
  const panelY = (height - panelHeight) / 2;
  fill('#fffdf5');
  stroke('#457b9d');
  strokeWeight(3);
  rect(panelX, panelY, panelWidth, panelHeight, 24);

  noStroke();
  fill('#1d3557');
  textAlign(CENTER, CENTER);
  textSize(min(30, max(22, width * 0.06)));
  text(percentage > 60 ? '太棒了！' : '完成挑戰！', width / 2, panelY + panelHeight * 0.22);
  textSize(min(19, max(15, width * 0.04)));
  text(`第一次答對 ${score} / ${QUESTION_COUNT} 題`, width / 2, panelY + panelHeight * 0.43);
  textSize(min(26, max(20, width * 0.055)));
  fill(percentage > 60 ? '#2d6a4f' : '#e07a5f');
  text(`答對率 ${percentage}%`, width / 2, panelY + panelHeight * 0.58);
  textSize(14);
  fill('#52616b');
  text(percentage > 60 ? '繼續保持，你真棒！' : '再玩一次，熟能生巧！', width / 2, panelY + panelHeight * 0.7);

  const button = getReplayButton(panelX, panelY, panelWidth, panelHeight);
  const homeButton = getHomeButton(panelX, panelY, panelWidth, panelHeight);
  noStroke();
  fill('#06a77d');
  rect(button.x, button.y, button.width, button.height, 16);
  fill('#ffffff');
  textSize(15);
  text('再玩一次', button.x + button.width / 2, button.y + button.height / 2);
  fill('#457b9d');
  rect(homeButton.x, homeButton.y, homeButton.width, homeButton.height, 16);
  fill('#ffffff');
  text('回到封面', homeButton.x + homeButton.width / 2, homeButton.y + homeButton.height / 2);
  pop();
}

// 計算「再玩一次」按鈕的位置與尺寸。
function getReplayButton(panelX, panelY, panelWidth, panelHeight) {
  const buttonWidth = min((panelWidth - 60) / 2, 170);
  const buttonHeight = 44;
  return {
    x: panelX + panelWidth / 2 - buttonWidth - 8,
    y: panelY + panelHeight - buttonHeight - 20,
    width: buttonWidth,
    height: buttonHeight
  };
}

// 計算「回到封面」按鈕的位置與尺寸。
function getHomeButton(panelX, panelY, panelWidth, panelHeight) {
  const buttonWidth = min((panelWidth - 60) / 2, 170);
  const buttonHeight = 44;
  return {
    x: panelX + panelWidth / 2 + 8,
    y: panelY + panelHeight - buttonHeight - 20,
    width: buttonWidth,
    height: buttonHeight
  };
}

// 高分時持續產生並繪製由上方落下的彩紙。
function drawConfetti() {
  if (confetti.length < 180 && frameCount % 2 === 0) {
    confetti.push({
      x: random(width),
      y: random(-height, -10),
      speed: random(2, 6),
      size: random(5, 10),
      rotation: random(TWO_PI),
      spin: random(-0.08, 0.08),
      color: random(CONFETTI_COLORS)
    });
  }

  noStroke();
  for (const piece of confetti) {
    piece.y += piece.speed;
    piece.x += sin(piece.y / 35 + piece.rotation) * 1.5;
    piece.rotation += piece.spin;
    fill(piece.color);
    push();
    translate(piece.x, piece.y);
    rotate(piece.rotation);
    rectMode(CENTER);
    rect(0, 0, piece.size, piece.size * 0.65, 2);
    pop();
  }
  confetti = confetti.filter((piece) => piece.y < height + 12);
}

// 處理滑鼠按下：開始測驗、點擊喇叭，或抓起答案卡。
function mousePressed() {
  if (celebrationState || returningHome) {
    return false;
  }

  if (!quizStarted) {
    const button = getStartButton();
    if (mouseX >= button.x && mouseX <= button.x + button.width
        && mouseY >= button.y && mouseY <= button.y + button.height) {
      quizStarted = true;
      characterX = characterHomeX = 46;
      characterY = characterHomeY = height - 42;
      nextIdleMoveAt = millis() + 500;
      speakText('快來測驗看看呀！');
    }
    return false;
  }

  if (roundComplete) {
    const panelWidth = min(width - 32, 430);
    const panelHeight = min(height - 40, 340);
    const panelX = (width - panelWidth) / 2;
    const panelY = (height - panelHeight) / 2;
    const button = getReplayButton(panelX, panelY, panelWidth, panelHeight);
    const homeButton = getHomeButton(panelX, panelY, panelWidth, panelHeight);
    if (mouseX >= button.x && mouseX <= button.x + button.width
        && mouseY >= button.y && mouseY <= button.y + button.height) {
      characterX = characterHomeX = 46;
      characterY = characterHomeY = height - 42;
      startNewRound();
    } else if (mouseX >= homeButton.x && mouseX <= homeButton.x + homeButton.width
        && mouseY >= homeButton.y && mouseY <= homeButton.y + homeButton.height) {
      quizStarted = false;
      characterX = characterHomeX = 46;
      characterY = characterHomeY = height - 42;
      startNewRound();
    }
    return false;
  }

  const layout = getLayout();
  for (let index = 0; index < QUESTION_COUNT; index += 1) {
    const speaker = getSpeakerRect(layout, index);
    if (mouseX >= speaker.x && mouseX <= speaker.x + speaker.width
        && mouseY >= speaker.y && mouseY <= speaker.y + speaker.height) {
      speakText(currentQuestions[index].question);
      feedback = `題目：${currentQuestions[index].question}`;
      feedbackIsCorrect = false;
      return false;
    }
  }

  for (const questionIndex of optionOrder) {
    if (completedQuestions[questionIndex]) {
      continue;
    }
    const rect = getOptionRect(layout, questionIndex);
    if (mouseX >= rect.x && mouseX <= rect.x + rect.width
        && mouseY >= rect.y && mouseY <= rect.y + rect.height) {
      draggingOption = questionIndex;
      dragOffsetX = mouseX - rect.x;
      dragOffsetY = mouseY - rect.y;
      interactionOrigin = { x: characterX, y: characterY };
      returningHome = false;
      celebrationState = '';
      wrongReactionState = '';
      wrongReactionUntil = 0;
      idleTargetX = null;
      actorHint = '';
      actorHintUntil = 0;
      feedback = `角色唸：「${currentQuestions[questionIndex].answer}」`;
      feedbackIsCorrect = false;
      speakText(currentQuestions[questionIndex].answer);
      return false;
    }
  }
}

// 處理放開答案卡：判斷配對結果、播放反應並更新作答進度。
function mouseReleased() {
  if (draggingOption === -1) {
    return;
  }

  const layout = getLayout();
  const droppedOption = draggingOption;
  const dropCenterX = mouseX - dragOffsetX + layout.optionCellWidth / 2;
  const dropCenterY = mouseY - dragOffsetY + layout.optionHeight / 2;
  let droppedOnQuestion = -1;

  for (let index = 0; index < QUESTION_COUNT; index += 1) {
    if (completedQuestions[index]) {
      continue;
    }
    const target = getAnswerRect(layout, index);
    if (dropCenterX >= target.x && dropCenterX <= target.x + target.width
        && dropCenterY >= target.y && dropCenterY <= target.y + target.height) {
      droppedOnQuestion = index;
      break;
    }
  }

  if (droppedOnQuestion !== -1) {
    const isCorrect = droppedOnQuestion === droppedOption;
    const answerTarget = getAnswerRect(layout, droppedOnQuestion);
    if (firstTryResults[droppedOnQuestion] === null) {
      firstTryResults[droppedOnQuestion] = isCorrect;
    }
    if (isCorrect) {
      completedQuestions[droppedOnQuestion] = true;
      createCandyBurst(answerTarget.x + answerTarget.width / 2, answerTarget.y + answerTarget.height / 2);
      celebrationState = 'jumping';
      celebrationStartedAt = millis();
      celebrationUntil = celebrationStartedAt + CELEBRATION_JUMP_DURATION;
      nextFireworkAt = celebrationStartedAt + CELEBRATION_FIREWORK_INTERVAL;
      fireworkSide = 1;
      characterX = width / 2;
      characterY = height - 80;
      createFireworkBurst(width / 2 - min(width * 0.13, 105), height - 125);
      createFireworkBurst(width / 2 + min(width * 0.13, 105), height - 125);
      createCelebrationConfetti();
      returningHome = false;
      idleTargetX = null;
      actorHint = '答對了！你真棒！';
      actorHintUntil = celebrationUntil;
      feedback = '答對了！';
      feedbackIsCorrect = true;
    } else {
      wrongReactionState = 'jumpingToHome';
      wrongReactionUntil = 0;
      screenShakeUntil = millis() + SCREEN_SHAKE_DURATION;
      actorHint = '答錯了也沒關係，我們再看看答案！';
      actorHintUntil = millis() + 7000;
      celebrationState = '';
      idleTargetX = null;
      feedback = '再試一次，看看哪個答案最適合！';
      feedbackIsCorrect = false;
    }
  } else {
    feedback = '把答案拖到左側相符題目的虛線框';
    feedbackIsCorrect = false;
  }

  draggingOption = -1;
  if (wrongReactionState === 'jumpingToHome') {
    wrongJumpStartedAt = millis();
    wrongJumpStartX = characterX;
    wrongJumpStartY = characterY;
    wrongJumpEndX = characterHomeX;
    wrongJumpEndY = characterHomeY;
    returningHome = false;
  } else if (celebrationState !== 'jumping') {
    returningHome = true;
  }
  if (interactionOrigin) {
    characterHomeX = interactionOrigin.x;
    characterHomeY = interactionOrigin.y;
  }
  if (wrongReactionState === 'jumpingToHome') {
    wrongJumpEndX = characterHomeX;
    wrongJumpEndY = characterHomeY;
  }
  interactionOrigin = null;

  if (completedQuestions.every(Boolean)) {
    roundComplete = true;
    if (firstTryResults.filter(Boolean).length / QUESTION_COUNT > 0.6) {
      confetti = [];
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      speakText('恭喜完成六題挑戰！');
    }
  }
  return false;
}

// 使用瀏覽器語音合成，以繁體中文朗讀指定文字。
function speakText(text) {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-TW';
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

// 讓數值每次朝目標移動固定距離，抵達時不會超過目標。
function moveTowards(current, target, step) {
  if (abs(target - current) <= step) {
    return target;
  }
  return current + Math.sign(target - current) * step;
}

// 視窗尺寸改變時重新調整畫布和角色、粒子的位置。
function windowResized() {
  const previousWidth = width;
  const previousHeight = height;
  resizeCanvas(windowWidth, windowHeight);
  const scaleX = width / max(1, previousWidth);
  const scaleY = height / max(1, previousHeight);
  characterX *= scaleX;
  characterY *= scaleY;
  characterHomeX *= scaleX;
  characterHomeY = height - 42;
  if (interactionOrigin) {
    interactionOrigin.x *= scaleX;
    interactionOrigin.y = height - 42;
  }
  wrongJumpStartX *= scaleX;
  wrongJumpStartY *= scaleY;
  wrongJumpEndX *= scaleX;
  wrongJumpEndY = height - 42;
  candyParticles.forEach((particle) => {
    particle.x *= scaleX;
    particle.y *= scaleY;
  });
  fireworkParticles.forEach((particle) => {
    particle.x *= scaleX;
    particle.y *= scaleY;
  });
  celebrationConfetti.forEach((piece) => {
    piece.x *= scaleX;
    piece.y *= scaleY;
  });
  if (celebrationState === 'jumping') {
    characterX = width / 2;
    characterY = height - 80;
  }
}
