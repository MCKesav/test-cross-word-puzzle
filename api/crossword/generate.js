// Native Vercel Serverless Function for /api/crossword/generate
// With proper crossword layout algorithm and validation

// Bytez SDK - lazy loaded
let bytezModel = null;

async function getBytezModel() {
    if (bytezModel) return bytezModel;

    const apiKey = process.env.BYTEZ_API_KEY;
    if (!apiKey) {
        throw new Error('BYTEZ_API_KEY is not configured');
    }

    const Bytez = (await import('bytez.js')).default;
    const sdk = new Bytez(apiKey);
    bytezModel = sdk.model('google/gemini-2.5-flash-lite');
    return bytezModel;
}

// Difficulty configurations
const DIFFICULTY_CONFIG = {
    easy: { wordLengthMin: 3, wordLengthMax: 7, clueStyle: 'direct, simple definitions', wordType: 'common, everyday words' },
    medium: { wordLengthMin: 4, wordLengthMax: 10, clueStyle: 'may use synonyms or indirect phrasing', wordType: 'mix of common and moderately difficult words' },
    hard: { wordLengthMin: 6, wordLengthMax: 12, clueStyle: 'indirect, conceptual, or cryptic', wordType: 'domain-specific, technical, or rare terms' }
};

const HINT_LIMITS = {
    easy: { semanticPerClue: -1, letterPerClue: 2, semanticPerPuzzle: -1, letterPerPuzzle: -1, penalty: 0 },
    medium: { semanticPerClue: 1, letterPerClue: 1, semanticPerPuzzle: -1, letterPerPuzzle: -1, penalty: 5 },
    hard: { semanticPerClue: 1, letterPerClue: 1, semanticPerPuzzle: 1, letterPerPuzzle: 1, penalty: 15 }
};

// Generate clues using LLM
async function generateCluesAndAnswers(topic, wordCount, difficulty) {
    const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;

    const prompt = `Generate ${wordCount} crossword entries for topic "${topic}".
Difficulty: ${difficulty.toUpperCase()}

Rules:
- One-word answers only, uppercase A-Z letters
- Word length: ${config.wordLengthMin}-${config.wordLengthMax} letters
- Word type: ${config.wordType}
- Clue style: ${config.clueStyle}
- No duplicate answers
- Output ONLY valid JSON array

Format:
[{"a":"ANSWER","c":"Clue text"}]`;

    console.log('📤 Calling Bytez API for topic:', topic);

    const model = await getBytezModel();
    const { error, output } = await model.run([{ role: 'user', content: prompt }]);

    if (error) {
        console.error('Bytez API error:', error);
        throw new Error('AI service error');
    }

    // Extract text from response
    let responseText = '';
    if (typeof output === 'string') {
        responseText = output;
    } else if (Array.isArray(output)) {
        const last = output[output.length - 1];
        responseText = last?.content || last?.text || JSON.stringify(output);
    } else if (output?.content) {
        responseText = output.content;
    } else if (output?.text) {
        responseText = output.text;
    } else if (output?.message?.content) {
        responseText = output.message.content;
    } else if (output?.choices?.[0]?.message?.content) {
        responseText = output.choices[0].message.content;
    } else {
        responseText = JSON.stringify(output);
    }

    console.log('📥 Response length:', responseText.length);

    // Extract JSON array
    const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
        throw new Error('AI returned invalid format');
    }

    let entries;
    try {
        entries = JSON.parse(jsonMatch[0]);
    } catch (e) {
        throw new Error('AI returned malformed JSON');
    }

    if (!Array.isArray(entries)) {
        throw new Error('AI response is not an array');
    }

    // Validate entries
    const validEntries = entries
        .filter(e => e?.a && e?.c && typeof e.a === 'string' && typeof e.c === 'string')
        .map(e => ({
            answer: e.a.toUpperCase().replace(/[^A-Z]/g, ''),
            clue: e.c.substring(0, 100)
        }))
        .filter(e => e.answer.length >= config.wordLengthMin && e.answer.length <= config.wordLengthMax);

    // Remove duplicates
    const seen = new Set();
    const uniqueEntries = validEntries.filter(e => {
        if (seen.has(e.answer)) return false;
        seen.add(e.answer);
        return true;
    });

    console.log('✅ Valid unique entries:', uniqueEntries.length);
    return uniqueEntries;
}

// ========== PROPER CROSSWORD LAYOUT ALGORITHM ==========

class CrosswordGrid {
    constructor(size = 20) {
        this.size = size;
        this.grid = Array(size).fill(null).map(() => Array(size).fill(null));
        this.placedWords = [];
    }

    canPlace(word, row, col, direction) {
        const len = word.length;

        // Check bounds
        if (direction === 'across') {
            if (col + len > this.size) return false;
        } else {
            if (row + len > this.size) return false;
        }

        // Check each cell
        for (let i = 0; i < len; i++) {
            const r = direction === 'across' ? row : row + i;
            const c = direction === 'across' ? col + i : col;
            const cell = this.grid[r][c];

            if (cell !== null && cell !== word[i]) {
                return false; // Conflict
            }
        }

        // Check adjacent cells (no parallel words touching)
        for (let i = 0; i < len; i++) {
            const r = direction === 'across' ? row : row + i;
            const c = direction === 'across' ? col + i : col;

            // If this cell is empty, check that we're not creating invalid adjacency
            if (this.grid[r][c] === null) {
                if (direction === 'across') {
                    // Check above and below
                    if (row > 0 && this.grid[r - 1][c] !== null) {
                        // Only allow if it's an intersection point
                        if (i > 0 && this.grid[r][c - 1] === null) return false;
                    }
                    if (row < this.size - 1 && this.grid[r + 1][c] !== null) {
                        if (i > 0 && this.grid[r][c - 1] === null) return false;
                    }
                } else {
                    // Check left and right
                    if (col > 0 && this.grid[r][c - 1] !== null) {
                        if (i > 0 && this.grid[r - 1][c] === null) return false;
                    }
                    if (col < this.size - 1 && this.grid[r][c + 1] !== null) {
                        if (i > 0 && this.grid[r - 1][c] === null) return false;
                    }
                }
            }
        }

        // Check before and after the word
        if (direction === 'across') {
            if (col > 0 && this.grid[row][col - 1] !== null) return false;
            if (col + len < this.size && this.grid[row][col + len] !== null) return false;
        } else {
            if (row > 0 && this.grid[row - 1][col] !== null) return false;
            if (row + len < this.size && this.grid[row + len][col] !== null) return false;
        }

        return true;
    }

    place(word, row, col, direction, clue, number) {
        for (let i = 0; i < word.length; i++) {
            const r = direction === 'across' ? row : row + i;
            const c = direction === 'across' ? col + i : col;
            this.grid[r][c] = word[i];
        }

        this.placedWords.push({
            answer: word,
            clue: clue,
            row: row,
            col: col,
            direction: direction,
            number: number
        });
    }

    findIntersections(word) {
        const intersections = [];

        for (const placed of this.placedWords) {
            for (let i = 0; i < word.length; i++) {
                for (let j = 0; j < placed.answer.length; j++) {
                    if (word[i] === placed.answer[j]) {
                        // Found matching letter
                        const newDirection = placed.direction === 'across' ? 'down' : 'across';

                        let newRow, newCol;
                        if (placed.direction === 'across') {
                            newRow = placed.row - i;
                            newCol = placed.col + j;
                        } else {
                            newRow = placed.row + j;
                            newCol = placed.col - i;
                        }

                        if (newRow >= 0 && newCol >= 0 && this.canPlace(word, newRow, newCol, newDirection)) {
                            intersections.push({ row: newRow, col: newCol, direction: newDirection });
                        }
                    }
                }
            }
        }

        return intersections;
    }

    getBounds() {
        let minRow = this.size, maxRow = 0, minCol = this.size, maxCol = 0;

        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                if (this.grid[r][c] !== null) {
                    minRow = Math.min(minRow, r);
                    maxRow = Math.max(maxRow, r);
                    minCol = Math.min(minCol, c);
                    maxCol = Math.max(maxCol, c);
                }
            }
        }

        return { minRow, maxRow, minCol, maxCol };
    }

    toOutput() {
        const bounds = this.getBounds();
        const width = bounds.maxCol - bounds.minCol + 1;
        const height = bounds.maxRow - bounds.minRow + 1;

        // Create normalized grid
        const grid = [];
        for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
            const row = [];
            for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
                row.push(this.grid[r][c] || '-');
            }
            grid.push(row);
        }

        // Create a map of word start positions
        const wordStarts = new Map(); // key: "row-col" -> { across: wordInfo, down: wordInfo }

        for (const word of this.placedWords) {
            const key = `${word.row}-${word.col}`;
            if (!wordStarts.has(key)) {
                wordStarts.set(key, {});
            }
            wordStarts.get(key)[word.direction] = word;
        }

        // Assign numbers in reading order (top-to-bottom, left-to-right)
        const across = [];
        const down = [];
        let number = 1;
        const numberMap = new Map();

        for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
            for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
                const key = `${r}-${c}`;
                const starts = wordStarts.get(key);

                if (starts) {
                    // This cell starts at least one word
                    const cellNumber = number++;
                    numberMap.set(key, cellNumber);

                    // Add across clue if exists
                    if (starts.across) {
                        across.push({
                            number: cellNumber,
                            clue: starts.across.clue,
                            answer: starts.across.answer,
                            x: c - bounds.minCol + 1,
                            y: r - bounds.minRow + 1
                        });
                    }

                    // Add down clue if exists
                    if (starts.down) {
                        down.push({
                            number: cellNumber,
                            clue: starts.down.clue,
                            answer: starts.down.answer,
                            x: c - bounds.minCol + 1,
                            y: r - bounds.minRow + 1
                        });
                    }
                }
            }
        }

        // Sort by number
        across.sort((a, b) => a.number - b.number);
        down.sort((a, b) => a.number - b.number);

        return { grid, width, height, across, down };
    }
}

function generateCrosswordLayout(entries) {
    if (!entries || entries.length < 2) {
        throw new Error('Not enough words to generate crossword');
    }

    // Sort by length (longer words first for better placement)
    const sortedEntries = [...entries].sort((a, b) => b.answer.length - a.answer.length);

    // Use smaller grid size for compactness
    const crossword = new CrosswordGrid(20);

    // Place first word near top-left for compact result
    const firstWord = sortedEntries[0];
    const startRow = 2; // Start near top
    const startCol = 2; // Start near left
    crossword.place(firstWord.answer, startRow, startCol, 'across', firstWord.clue, 1);

    // Try to place remaining words with preference for compact placement
    let placedCount = 1;
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        for (let i = 1; i < sortedEntries.length; i++) {
            const entry = sortedEntries[i];

            // Check if already placed
            if (crossword.placedWords.some(w => w.answer === entry.answer)) continue;

            const intersections = crossword.findIntersections(entry.answer);

            if (intersections.length > 0) {
                // Score intersections - prefer ones that keep grid compact
                const bounds = crossword.getBounds();
                const centerRow = (bounds.minRow + bounds.maxRow) / 2;
                const centerCol = (bounds.minCol + bounds.maxCol) / 2;

                // Sort by distance from current center (closer is better)
                intersections.sort((a, b) => {
                    const distA = Math.abs(a.row - centerRow) + Math.abs(a.col - centerCol);
                    const distB = Math.abs(b.row - centerRow) + Math.abs(b.col - centerCol);
                    return distA - distB;
                });

                const best = intersections[0];
                crossword.place(entry.answer, best.row, best.col, best.direction, entry.clue, ++placedCount);
            }
        }
    }

    if (crossword.placedWords.length < 3) {
        throw new Error('Could not place enough words in crossword');
    }

    console.log(`✅ Placed ${crossword.placedWords.length} words`);
    return crossword.toOutput();
}

// ========== MAIN HANDLER ==========

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    console.log('🧩 API HIT:', new Date().toISOString(), req.method, req.url);

    try {
        // Check API key first
        if (!process.env.BYTEZ_API_KEY) {
            console.error('❌ BYTEZ_API_KEY not set');
            return res.status(200).json({
                ok: false,
                error: { code: 'MISSING_API_KEY', message: 'Server AI configuration missing' }
            });
        }

        if (req.method !== 'POST') {
            return res.status(200).json({
                ok: false,
                error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST method' }
            });
        }

        const { topic, wordCount = 8, difficulty = 'medium' } = req.body || {};

        if (!topic || typeof topic !== 'string') {
            return res.status(200).json({
                ok: false,
                error: { code: 'INVALID_TOPIC', message: 'Topic is required' }
            });
        }

        const normalizedDifficulty = (difficulty || 'medium').toLowerCase();
        if (!['easy', 'medium', 'hard'].includes(normalizedDifficulty)) {
            return res.status(200).json({
                ok: false,
                error: { code: 'INVALID_DIFFICULTY', message: 'Difficulty must be easy, medium, or hard' }
            });
        }

        const normalizedTopic = topic.trim().substring(0, 50);
        console.log('🎯 Generating:', { topic: normalizedTopic, difficulty: normalizedDifficulty });

        // Generate words from AI
        const entries = await generateCluesAndAnswers(
            normalizedTopic,
            Math.min(Math.max(wordCount, 5), 12),
            normalizedDifficulty
        );

        if (!entries || entries.length < 3) {
            return res.status(200).json({
                ok: false,
                error: { code: 'INSUFFICIENT_WORDS', message: 'Could not generate enough valid words' }
            });
        }

        // Generate crossword layout with proper algorithm
        const layout = generateCrosswordLayout(entries);

        // Validate output
        if (!layout.grid || !layout.across || !layout.down) {
            throw new Error('Invalid crossword layout generated');
        }

        if (layout.across.length === 0 && layout.down.length === 0) {
            throw new Error('No clues generated');
        }

        // Build response
        const puzzle = {
            meta: { title: `${normalizedTopic.charAt(0).toUpperCase() + normalizedTopic.slice(1)} Crossword` },
            dimensions: { width: layout.width, height: layout.height },
            grid: layout.grid,
            clues: { across: layout.across, down: layout.down }
        };

        const limits = HINT_LIMITS[normalizedDifficulty];
        puzzle.difficulty = { level: normalizedDifficulty, hintLimits: { ...limits } };

        console.log('✅ Puzzle generated:', layout.across.length, 'across,', layout.down.length, 'down');

        return res.status(200).json({
            ok: true,
            ...puzzle,
            cached: false
        });

    } catch (error) {
        console.error('❌ Generation error:', error.message);

        return res.status(200).json({
            ok: false,
            error: {
                code: 'GENERATION_FAILED',
                message: error.message || 'Failed to generate puzzle'
            }
        });
    }
}
