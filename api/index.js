// Vercel Serverless API for Crossword Generator
// All routes and logic inlined to avoid module resolution issues

import express from 'express';
import cors from 'cors';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});

// ============ INLINE SERVICES ============

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

// Lazy-loaded Bytez SDK (initialized only when needed)
let bytezModel = null;

async function getBytezModel() {
    if (bytezModel) return bytezModel;

    const apiKey = process.env.BYTEZ_API_KEY;
    if (!apiKey) {
        throw new Error('BYTEZ_API_KEY environment variable is not set');
    }

    const Bytez = (await import('bytez.js')).default;
    const sdk = new Bytez(apiKey);
    bytezModel = sdk.model('google/gemini-2.5-flash-lite');
    return bytezModel;
}

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
        throw new Error(`Bytez API error: ${JSON.stringify(error)}`);
    }

    // Extract text from various response formats
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

    console.log('📥 Response received, length:', responseText.length);

    // Extract JSON array
    const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
        throw new Error('No JSON array found in LLM response');
    }

    const entries = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(entries)) {
        throw new Error('LLM response is not an array');
    }

    // Validate entries
    const validEntries = entries
        .filter(e => e?.a && e?.c)
        .map(e => ({
            a: e.a.toUpperCase().replace(/[^A-Z]/g, ''),
            c: e.c.substring(0, 100)
        }))
        .filter(e => e.a.length >= config.wordLengthMin && e.a.length <= config.wordLengthMax);

    console.log('✅ Valid entries:', validEntries.length);
    return validEntries;
}

// Generate layout (simplified inline version)
function generateLayout(entries) {
    // Simple grid generation - place words
    const words = entries.map((e, i) => ({
        answer: e.a,
        clue: e.c,
        startx: 1,
        starty: i + 1,
        orientation: i % 2 === 0 ? 'across' : 'down',
        position: i + 1
    }));

    // Calculate grid size
    let maxX = 1, maxY = 1;
    words.forEach((w, i) => {
        if (w.orientation === 'across') {
            maxX = Math.max(maxX, w.startx + w.answer.length);
            maxY = Math.max(maxY, w.starty + 1);
        } else {
            maxX = Math.max(maxX, w.startx + 1);
            maxY = Math.max(maxY, w.starty + w.answer.length);
        }
    });

    // Build grid
    const grid = [];
    for (let y = 0; y < maxY; y++) {
        const row = [];
        for (let x = 0; x < maxX; x++) {
            row.push('-');
        }
        grid.push(row);
    }

    // Place words
    words.forEach(w => {
        for (let i = 0; i < w.answer.length; i++) {
            if (w.orientation === 'across') {
                grid[w.starty - 1][w.startx - 1 + i] = w.answer[i];
            } else {
                grid[w.starty - 1 + i][w.startx - 1] = w.answer[i];
            }
        }
    });

    return { grid, words, width: maxX, height: maxY };
}

function toCrosswordJsFormat(layout, topic) {
    const across = layout.words.filter(w => w.orientation === 'across').map((w, i) => ({
        number: i + 1,
        clue: w.clue,
        answer: w.answer,
        x: w.startx,
        y: w.starty
    }));

    const down = layout.words.filter(w => w.orientation === 'down').map((w, i) => ({
        number: across.length + i + 1,
        clue: w.clue,
        answer: w.answer,
        x: w.startx,
        y: w.starty
    }));

    return {
        meta: { title: `${topic.charAt(0).toUpperCase() + topic.slice(1)} Crossword` },
        dimensions: { width: layout.width, height: layout.height },
        grid: layout.grid,
        clues: { across, down }
    };
}

// Strategic letter reveal
function getStrategicLetterReveal(answer, userInput = '', alreadyRevealed = []) {
    const answerArr = answer.toUpperCase().split('');
    const userArr = (userInput || '').toUpperCase().padEnd(answer.length, ' ').split('');

    const candidates = [];
    for (let i = 0; i < answerArr.length; i++) {
        if (alreadyRevealed.includes(i)) continue;
        if (userArr[i] === answerArr[i]) continue;
        if (alreadyRevealed.includes(i - 1) || alreadyRevealed.includes(i + 1)) continue;
        candidates.push(i);
    }

    if (candidates.length === 0) return null;
    const chosenIndex = candidates[Math.floor(Math.random() * candidates.length)];
    return { index: chosenIndex, letter: answerArr[chosenIndex] };
}

// ============ ROUTES ============

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        hasApiKey: !!process.env.BYTEZ_API_KEY
    });
});

// GET /api/crossword/topics
app.get('/api/crossword/topics', (req, res) => {
    res.json({
        ok: true,
        topics: [
            'Programming', 'Space Exploration', 'World Geography',
            'Classical Music', 'Marine Biology', 'Ancient History',
            'Cooking & Food', 'Sports', 'Movies & Cinema', 'Science & Technology'
        ]
    });
});

// GET /api/crossword/difficulty
app.get('/api/crossword/difficulty', (req, res) => {
    res.json({
        ok: true,
        levels: [
            { id: 'easy', name: 'Easy', description: 'Common words, direct clues', wordLength: '3-7 letters' },
            { id: 'medium', name: 'Medium', description: 'Mixed difficulty, indirect clues', wordLength: '4-10 letters' },
            { id: 'hard', name: 'Hard', description: 'Technical terms, cryptic clues', wordLength: '6-12 letters' }
        ]
    });
});

// POST /api/crossword/generate
app.post('/api/crossword/generate', async (req, res) => {
    try {
        // Check API key first
        if (!process.env.BYTEZ_API_KEY) {
            return res.status(500).json({
                ok: false,
                error: { code: 'MISSING_API_KEY', message: 'Server is not configured with AI API key' }
            });
        }

        const { topic, wordCount = 10, difficulty = 'medium' } = req.body || {};

        if (!topic || typeof topic !== 'string') {
            return res.status(400).json({
                ok: false,
                error: { code: 'INVALID_TOPIC', message: 'Topic is required and must be a string' }
            });
        }

        const normalizedDifficulty = (difficulty || 'medium').toLowerCase();
        if (!['easy', 'medium', 'hard'].includes(normalizedDifficulty)) {
            return res.status(400).json({
                ok: false,
                error: { code: 'INVALID_DIFFICULTY', message: 'Difficulty must be easy, medium, or hard' }
            });
        }

        const normalizedTopic = topic.trim();
        if (normalizedTopic.length < 2 || normalizedTopic.length > 100) {
            return res.status(400).json({
                ok: false,
                error: { code: 'INVALID_TOPIC_LENGTH', message: 'Topic must be between 2 and 100 characters' }
            });
        }

        console.log('🧩 Generating puzzle:', { topic: normalizedTopic, difficulty: normalizedDifficulty });

        const entries = await generateCluesAndAnswers(
            normalizedTopic,
            Math.min(Math.max(wordCount, 5), 15), // Reduced max for faster generation
            normalizedDifficulty
        );

        if (!entries || entries.length < 3) {
            return res.status(422).json({
                ok: false,
                error: { code: 'INSUFFICIENT_WORDS', message: 'Could not generate enough valid words for the crossword' }
            });
        }

        const layout = generateLayout(entries);
        const puzzle = toCrosswordJsFormat(layout, normalizedTopic);

        const limits = HINT_LIMITS[normalizedDifficulty];
        puzzle.difficulty = {
            level: normalizedDifficulty,
            hintLimits: { ...limits }
        };

        console.log('✅ Puzzle generated successfully');
        res.json({ ok: true, ...puzzle, cached: false });

    } catch (error) {
        console.error('❌ Generation error:', error.message);

        let errorResponse = {
            ok: false,
            error: { code: 'GENERATION_FAILED', message: 'Failed to generate crossword puzzle' }
        };

        if (error.message?.includes('API key') || error.message?.includes('BYTEZ')) {
            errorResponse.error = { code: 'API_CONFIG_ERROR', message: 'AI service configuration error' };
        } else if (error.message?.includes('JSON')) {
            errorResponse.error = { code: 'AI_RESPONSE_ERROR', message: 'AI returned invalid response' };
        }

        res.status(500).json(errorResponse);
    }
});

// POST /api/crossword/hint
app.post('/api/crossword/hint', async (req, res) => {
    try {
        const { hintType, clue, answer, userInput, alreadyRevealed, difficulty, usage } = req.body || {};

        if (!hintType || !['semantic', 'letter'].includes(hintType)) {
            return res.status(400).json({
                ok: false,
                error: { code: 'INVALID_HINT_TYPE', message: 'hintType must be "semantic" or "letter"' }
            });
        }

        if (!answer) {
            return res.status(400).json({
                ok: false,
                error: { code: 'MISSING_ANSWER', message: 'answer is required' }
            });
        }

        const normalizedDifficulty = (difficulty || 'medium').toLowerCase();
        const usageData = usage || { semanticForClue: 0, semanticTotal: 0, letterForClue: 0, letterTotal: 0 };
        const limits = HINT_LIMITS[normalizedDifficulty] || HINT_LIMITS.medium;

        // Check limits
        if (hintType === 'semantic') {
            if (limits.semanticPerClue !== -1 && usageData.semanticForClue >= limits.semanticPerClue) {
                return res.json({ ok: true, limitReached: true, message: 'Clue hint limit reached' });
            }
            if (limits.semanticPerPuzzle !== -1 && usageData.semanticTotal >= limits.semanticPerPuzzle) {
                return res.json({ ok: true, limitReached: true, message: 'Puzzle hint limit reached' });
            }
        } else {
            if (limits.letterPerClue !== -1 && usageData.letterForClue >= limits.letterPerClue) {
                return res.json({ ok: true, limitReached: true, message: 'Letter reveal limit reached' });
            }
            if (limits.letterPerPuzzle !== -1 && usageData.letterTotal >= limits.letterPerPuzzle) {
                return res.json({ ok: true, limitReached: true, message: 'Puzzle letter limit reached' });
            }
        }

        let result;

        if (hintType === 'semantic') {
            // Simple semantic hint without LLM to avoid timeouts
            const firstLetter = answer[0];
            const length = answer.length;
            result = {
                ok: true,
                type: 'semantic',
                hint: `Think about "${clue}" - the answer starts with "${firstLetter}" and has ${length} letters.`,
                penalty: limits.penalty
            };
        } else {
            const reveal = getStrategicLetterReveal(answer, userInput || '', alreadyRevealed || []);
            if (!reveal) {
                return res.json({ ok: true, type: 'letter', hint: null, message: 'No more letters to reveal', penalty: 0 });
            }
            result = {
                ok: true,
                type: 'letter',
                hint: { index: reveal.index, letter: reveal.letter },
                penalty: limits.penalty
            };
        }

        res.json(result);

    } catch (error) {
        console.error('Hint error:', error.message);
        res.status(500).json({
            ok: false,
            error: { code: 'HINT_FAILED', message: 'Failed to generate hint' }
        });
    }
});

// Error handling - ALWAYS return JSON
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' }
    });
});

// 404 handler - ALWAYS return JSON
app.use((req, res) => {
    res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: `Route ${req.path} not found` }
    });
});

// Export for Vercel
export default app;
