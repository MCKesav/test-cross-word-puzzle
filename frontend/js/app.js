// Use relative URL in production (Vercel), localhost in development
const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api/crossword'
    : '/api/crossword';

// State
let currentPuzzle = null;
let selectedDifficulty = 'medium';
let score = 100;
let hintUsage = {
    semanticTotal: 0,
    letterTotal: 0,
    byClue: {} // { clueId: { semantic: 0, letter: 0, revealedIndices: [] } }
};

// DOM Elements
const topicInput = document.getElementById('topic');
const wordCountSlider = document.getElementById('wordCount');
const wordCountDisplay = document.getElementById('wordCountDisplay');
const generateBtn = document.getElementById('generateBtn');
const puzzleSection = document.getElementById('puzzleSection');
const puzzleTitle = document.getElementById('puzzleTitle');
const crosswordGrid = document.getElementById('crosswordGrid');
const acrossClues = document.getElementById('acrossClues');
const downClues = document.getElementById('downClues');
const checkBtn = document.getElementById('checkBtn');
const revealBtn = document.getElementById('revealBtn');
const newPuzzleBtn = document.getElementById('newPuzzleBtn');
const topicButtons = document.getElementById('topicButtons');
const errorMessage = document.getElementById('errorMessage');
const difficultySelector = document.getElementById('difficultySelector');
const difficultyBadge = document.getElementById('difficultyBadge');
const scoreDisplay = document.getElementById('scoreDisplay');
const hintCounter = document.getElementById('hintCounter');
const hintDisplay = document.getElementById('hintDisplay');
const hintText = document.getElementById('hintText');
const closeHintBtn = document.getElementById('closeHint');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadSuggestedTopics();
    setupEventListeners();
    setupDifficultySelector();
    setupResizeHandles();
});

function setupEventListeners() {
    generateBtn.addEventListener('click', generatePuzzle);
    wordCountSlider.addEventListener('input', updateWordCountDisplay);
    checkBtn.addEventListener('click', checkAnswers);
    revealBtn.addEventListener('click', revealAll);
    newPuzzleBtn.addEventListener('click', resetPuzzle);
    closeHintBtn.addEventListener('click', hideHint);
    topicInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') generatePuzzle();
    });
}

function setupDifficultySelector() {
    const buttons = difficultySelector.querySelectorAll('.difficulty-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedDifficulty = btn.dataset.difficulty;
        });
    });
}

function resetPuzzle() {
    puzzleSection.hidden = true;
    topicInput.value = '';
    score = 100;
    hintUsage = { semanticTotal: 0, letterTotal: 0, byClue: {} };
    hideHint();
    topicInput.focus();
}

function updateWordCountDisplay() {
    wordCountDisplay.textContent = `${wordCountSlider.value} words`;
}

async function loadSuggestedTopics() {
    try {
        const response = await fetch(`${API_URL}/topics`);
        const data = await response.json();
        renderTopicButtons(data.topics);
    } catch (error) {
        console.error('Failed to load topics:', error);
        renderTopicButtons(['Programming', 'Science', 'History', 'Movies', 'Sports']);
    }
}

function renderTopicButtons(topics) {
    topicButtons.innerHTML = topics.map(topic =>
        `<button type="button" data-topic="${topic}">${topic}</button>`
    ).join('');

    topicButtons.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            topicInput.value = btn.dataset.topic;
            generatePuzzle();
        });
    });
}

async function generatePuzzle() {
    const topic = topicInput.value.trim();
    if (!topic) {
        showError('Please enter a topic');
        return;
    }

    hideError();
    setLoading(true);

    // Reset state
    score = 100;
    hintUsage = { semanticTotal: 0, letterTotal: 0, byClue: {} };
    hideHint();

    try {
        const response = await fetch(`${API_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                topic,
                wordCount: parseInt(wordCountSlider.value),
                difficulty: selectedDifficulty
            })
        });

        // Safe JSON parsing
        let data;
        const text = await response.text();

        if (!text || text.trim() === '') {
            throw new Error('Server returned empty response. Please try again.');
        }

        try {
            data = JSON.parse(text);
        } catch (parseError) {
            console.error('JSON parse error:', parseError, 'Response:', text.substring(0, 200));
            throw new Error('Server returned invalid response. Please try again.');
        }

        // Check for error in response (new API format)
        if (data.ok === false || data.error) {
            const errorMsg = data.error?.message || data.error || 'Failed to generate puzzle';
            throw new Error(errorMsg);
        }

        if (!data.grid || !data.clues) {
            throw new Error('Invalid puzzle data received. Please try again.');
        }

        currentPuzzle = data;
        renderPuzzle();
        updateStats();
        puzzleSection.hidden = false;
        puzzleSection.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('Generate error:', error);
        showError(error.message);
    } finally {
        setLoading(false);
    }
}

function renderPuzzle() {
    if (!currentPuzzle) return;

    puzzleTitle.textContent = currentPuzzle.meta.title;

    // Difficulty badge
    const difficulty = currentPuzzle.difficulty?.level || selectedDifficulty;
    difficultyBadge.textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    difficultyBadge.className = `difficulty-badge ${difficulty}`;

    // Grid
    const { width, height } = currentPuzzle.dimensions;
    crosswordGrid.style.gridTemplateColumns = `repeat(${width}, 36px)`;

    const positionMap = {};
    [...currentPuzzle.clues.across, ...currentPuzzle.clues.down].forEach(clue => {
        const key = `${clue.x}-${clue.y}`;
        if (!positionMap[key]) positionMap[key] = clue.number;
    });

    let gridHTML = '';
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cell = currentPuzzle.grid[y]?.[x] || '-';
            const key = `${x + 1}-${y + 1}`;
            const cellNumber = positionMap[key];

            if (cell === '-' || cell === ' ' || cell === '') {
                gridHTML += `<div class="grid-cell empty"></div>`;
            } else {
                const numberLabel = cellNumber ? `<span class="cell-number">${cellNumber}</span>` : '';
                gridHTML += `
          <div class="grid-cell letter" data-x="${x}" data-y="${y}" data-answer="${cell}">
            ${numberLabel}
            <input type="text" maxlength="1" data-x="${x}" data-y="${y}" autocomplete="off">
          </div>
        `;
            }
        }
    }
    crosswordGrid.innerHTML = gridHTML;

    crosswordGrid.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', handleCellInput);
        input.addEventListener('keydown', handleCellKeydown);
    });

    // Clues with two hint buttons
    acrossClues.innerHTML = currentPuzzle.clues.across.map(clue =>
        renderClueItem(clue, 'across')
    ).join('');

    downClues.innerHTML = currentPuzzle.clues.down.map(clue =>
        renderClueItem(clue, 'down')
    ).join('');

    setupClueHandlers();
}

function renderClueItem(clue, direction) {
    const clueId = `${direction}-${clue.number}`;
    const penalty = currentPuzzle.difficulty?.hintLimits?.penalty || 0;
    const penaltyText = penalty > 0 ? `<span class="hint-penalty">-${penalty}</span>` : '';

    return `
    <li data-clue-id="${clueId}" data-number="${clue.number}" data-direction="${direction}" data-answer="${clue.answer}" data-clue="${clue.clue}">
      <div class="clue-content">
        <span class="clue-number">${clue.number}.</span>
        <span class="clue-text">${clue.clue}</span>
      </div>
      <div class="hint-buttons">
        <button class="hint-btn semantic-hint-btn" data-clue-id="${clueId}" data-type="semantic" title="Get a clue hint">
          💭${penaltyText}
        </button>
        <button class="hint-btn letter-hint-btn" data-clue-id="${clueId}" data-type="letter" title="Reveal a letter">
          🔤${penaltyText}
        </button>
      </div>
    </li>
  `;
}

function setupClueHandlers() {
    // Clue click to focus
    document.querySelectorAll('.clue-list li').forEach(li => {
        li.addEventListener('click', (e) => {
            if (e.target.closest('.hint-btn')) return;
            focusClue(li);
        });
    });

    // Hint buttons
    document.querySelectorAll('.hint-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            requestHint(btn);
        });
    });
}

function focusClue(li) {
    const number = li.dataset.number;
    const clue = [...currentPuzzle.clues.across, ...currentPuzzle.clues.down]
        .find(c => c.number == number);
    if (clue) {
        const input = crosswordGrid.querySelector(
            `input[data-x="${clue.x - 1}"][data-y="${clue.y - 1}"]`
        );
        if (input) input.focus();
    }
}

async function requestHint(btn) {
    const clueId = btn.dataset.clueId;
    const hintType = btn.dataset.type;
    const li = btn.closest('li');
    const answer = li.dataset.answer;
    const clue = li.dataset.clue;

    // Initialize clue usage if needed
    if (!hintUsage.byClue[clueId]) {
        hintUsage.byClue[clueId] = { semantic: 0, letter: 0, revealedIndices: [] };
    }

    const clueUsage = hintUsage.byClue[clueId];

    // Get user's current input for this word
    const userInput = getUserInputForClue(li);

    // Prepare usage data for API
    const usage = {
        semanticForClue: clueUsage.semantic,
        semanticTotal: hintUsage.semanticTotal,
        letterForClue: clueUsage.letter,
        letterTotal: hintUsage.letterTotal
    };

    btn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/hint`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hintType,
                clue,
                answer,
                userInput,
                alreadyRevealed: clueUsage.revealedIndices,
                intersections: {},
                difficulty: selectedDifficulty,
                usage
            })
        });

        const data = await response.json();

        if (!response.ok) {
            if (data.limitReached) {
                btn.classList.add('limit-reached');
                showHint(data.error);
            } else {
                showError(data.error);
            }
            return;
        }

        // Apply penalty
        if (data.penalty > 0) {
            score = Math.max(0, score - data.penalty);
        }

        // Update usage tracking
        if (hintType === 'semantic') {
            clueUsage.semantic++;
            hintUsage.semanticTotal++;
            showHint(data.hint);
        } else {
            if (data.hint) {
                clueUsage.letter++;
                hintUsage.letterTotal++;
                clueUsage.revealedIndices.push(data.hint.index);

                // Reveal the letter in the grid
                revealLetterInGrid(li, data.hint.index, data.hint.letter);
                showHint(`Letter revealed: position ${data.hint.index + 1} = "${data.hint.letter}"`);
            } else {
                showHint(data.message || 'No more letters to reveal');
            }
        }

        // Mark button as used
        btn.classList.add('used');
        updateStats();
        updateHintButtons();

    } catch (error) {
        showError('Failed to get hint');
    } finally {
        btn.disabled = false;
    }
}

function getUserInputForClue(li) {
    const direction = li.dataset.direction;
    const number = parseInt(li.dataset.number);
    const clue = [...currentPuzzle.clues.across, ...currentPuzzle.clues.down]
        .find(c => c.number === number &&
            ((direction === 'across' && currentPuzzle.clues.across.includes(c)) ||
                (direction === 'down' && currentPuzzle.clues.down.includes(c))));

    if (!clue) return '';

    let input = '';
    const startX = clue.x - 1;
    const startY = clue.y - 1;

    for (let i = 0; i < clue.answer.length; i++) {
        const x = direction === 'across' ? startX + i : startX;
        const y = direction === 'down' ? startY + i : startY;
        const cell = crosswordGrid.querySelector(`input[data-x="${x}"][data-y="${y}"]`);
        input += cell?.value || ' ';
    }

    return input;
}

function revealLetterInGrid(li, index, letter) {
    const direction = li.dataset.direction;
    const number = parseInt(li.dataset.number);
    const clue = [...currentPuzzle.clues.across, ...currentPuzzle.clues.down]
        .find(c => c.number === number);

    if (!clue) return;

    const startX = clue.x - 1;
    const startY = clue.y - 1;
    const x = direction === 'across' ? startX + index : startX;
    const y = direction === 'down' ? startY + index : startY;

    const input = crosswordGrid.querySelector(`input[data-x="${x}"][data-y="${y}"]`);
    if (input) {
        input.value = letter;
        input.closest('.grid-cell').classList.add('revealed');
    }
}

function updateHintButtons() {
    const limits = currentPuzzle.difficulty?.hintLimits || {};

    document.querySelectorAll('.clue-list li').forEach(li => {
        const clueId = li.dataset.clueId;
        const usage = hintUsage.byClue[clueId] || { semantic: 0, letter: 0 };

        const semanticBtn = li.querySelector('.semantic-hint-btn');
        const letterBtn = li.querySelector('.letter-hint-btn');

        // Check semantic limit
        if (limits.semanticPerClue !== -1 && usage.semantic >= limits.semanticPerClue) {
            semanticBtn?.classList.add('limit-reached');
        }
        if (limits.semanticPerPuzzle !== -1 && hintUsage.semanticTotal >= limits.semanticPerPuzzle) {
            document.querySelectorAll('.semantic-hint-btn').forEach(b => b.classList.add('limit-reached'));
        }

        // Check letter limit
        if (limits.letterPerClue !== -1 && usage.letter >= limits.letterPerClue) {
            letterBtn?.classList.add('limit-reached');
        }
        if (limits.letterPerPuzzle !== -1 && hintUsage.letterTotal >= limits.letterPerPuzzle) {
            document.querySelectorAll('.letter-hint-btn').forEach(b => b.classList.add('limit-reached'));
        }
    });
}

function updateStats() {
    scoreDisplay.textContent = `Score: ${score}`;
    const totalHints = hintUsage.semanticTotal + hintUsage.letterTotal;
    hintCounter.textContent = `Hints: ${totalHints}`;
}

function handleCellInput(e) {
    const input = e.target;
    const value = input.value.toUpperCase();
    input.value = value;

    if (value) {
        const x = parseInt(input.dataset.x);
        const y = parseInt(input.dataset.y);
        const nextInput = crosswordGrid.querySelector(`input[data-x="${x + 1}"][data-y="${y}"]`) ||
            crosswordGrid.querySelector(`input[data-x="${x}"][data-y="${y + 1}"]`);
        if (nextInput) nextInput.focus();
    }
}

function handleCellKeydown(e) {
    const input = e.target;
    const x = parseInt(input.dataset.x);
    const y = parseInt(input.dataset.y);
    let nextInput = null;

    switch (e.key) {
        case 'ArrowRight': nextInput = crosswordGrid.querySelector(`input[data-x="${x + 1}"][data-y="${y}"]`); break;
        case 'ArrowLeft': nextInput = crosswordGrid.querySelector(`input[data-x="${x - 1}"][data-y="${y}"]`); break;
        case 'ArrowDown': nextInput = crosswordGrid.querySelector(`input[data-x="${x}"][data-y="${y + 1}"]`); break;
        case 'ArrowUp': nextInput = crosswordGrid.querySelector(`input[data-x="${x}"][data-y="${y - 1}"]`); break;
        case 'Backspace': if (!input.value) nextInput = crosswordGrid.querySelector(`input[data-x="${x - 1}"][data-y="${y}"]`); break;
    }

    if (nextInput) { e.preventDefault(); nextInput.focus(); }
}

function checkAnswers() {
    crosswordGrid.querySelectorAll('.grid-cell.letter').forEach(cell => {
        const input = cell.querySelector('input');
        const answer = cell.dataset.answer;
        const userValue = input.value.toUpperCase();
        cell.classList.remove('correct', 'incorrect');
        if (userValue) {
            cell.classList.add(userValue === answer ? 'correct' : 'incorrect');
        }
    });
}

function revealAll() {
    crosswordGrid.querySelectorAll('.grid-cell.letter').forEach(cell => {
        const input = cell.querySelector('input');
        input.value = cell.dataset.answer;
        cell.classList.remove('incorrect');
        cell.classList.add('correct');
    });
    score = 0;
    updateStats();
}

function showHint(text) {
    hintText.textContent = text;
    hintDisplay.hidden = false;
}

function hideHint() {
    hintDisplay.hidden = true;
}

function setLoading(loading) {
    generateBtn.disabled = loading;
    generateBtn.querySelector('.btn-text').hidden = loading;
    generateBtn.querySelector('.btn-loading').hidden = !loading;
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.hidden = false;
}

function hideError() {
    errorMessage.hidden = true;
}

// ========== RESIZABLE PANELS ==========
function setupResizeHandles() {
    const handles = document.querySelectorAll('.resize-handle');

    handles.forEach(handle => {
        let isResizing = false;
        let startX = 0;
        let leftPanel = null;
        let rightPanel = null;
        let leftWidth = 0;
        let rightWidth = 0;
        let isEdge = handle.dataset.edge;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;

            if (isEdge === 'left') {
                // Left edge - only resize right panel (grid panel)
                leftPanel = null;
                rightPanel = handle.nextElementSibling;
                if (rightPanel) {
                    rightWidth = rightPanel.getBoundingClientRect().width;
                }
            } else if (isEdge === 'right') {
                // Right edge - only resize left panel (down panel)
                leftPanel = handle.previousElementSibling;
                rightPanel = null;
                if (leftPanel) {
                    leftWidth = leftPanel.getBoundingClientRect().width;
                }
            } else {
                // Middle handles - resize both adjacent panels
                leftPanel = handle.previousElementSibling;
                rightPanel = handle.nextElementSibling;

                if (leftPanel && rightPanel) {
                    leftWidth = leftPanel.getBoundingClientRect().width;
                    rightWidth = rightPanel.getBoundingClientRect().width;
                }
            }

            document.body.classList.add('resizing');
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const dx = e.clientX - startX;

            if (isEdge === 'left' && rightPanel) {
                // Left edge - expand/shrink right panel
                const newWidth = Math.max(200, rightWidth - dx);
                rightPanel.style.flex = `0 0 ${newWidth}px`;
            } else if (isEdge === 'right' && leftPanel) {
                // Right edge - expand/shrink left panel
                const newWidth = Math.max(150, leftWidth + dx);
                leftPanel.style.flex = `0 0 ${newWidth}px`;
            } else if (leftPanel && rightPanel) {
                // Middle handle - resize both
                const newLeftWidth = Math.max(150, leftWidth + dx);
                const newRightWidth = Math.max(150, rightWidth - dx);

                leftPanel.style.flex = `0 0 ${newLeftWidth}px`;
                rightPanel.style.flex = `0 0 ${newRightWidth}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.classList.remove('resizing');
                leftPanel = null;
                rightPanel = null;
            }
        });
    });
}
