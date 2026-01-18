// Native Vercel Serverless Function for /api/crossword/generate
// This format is guaranteed to work on Vercel

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
        throw new Error(`AI service error`);
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

    const entries = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(entries)) {
        throw new Error('AI response is not an array');
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

// Simple grid generation
function generateLayout(entries) {
    const words = entries.map((e, i) => ({
        answer: e.a,
        clue: e.c,
        startx: 1,
        starty: i + 1,
        orientation: i % 2 === 0 ? 'across' : 'down',
        position: i + 1
    }));

    let maxX = 1, maxY = 1;
    words.forEach((w) => {
        if (w.orientation === 'across') {
            maxX = Math.max(maxX, w.startx + w.answer.length);
            maxY = Math.max(maxY, w.starty + 1);
        } else {
            maxX = Math.max(maxX, w.startx + 1);
            maxY = Math.max(maxY, w.starty + w.answer.length);
        }
    });

    const grid = [];
    for (let y = 0; y < maxY; y++) {
        const row = [];
        for (let x = 0; x < maxX; x++) {
            row.push('-');
        }
        grid.push(row);
    }

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

// Main handler - Vercel native format
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

        const entries = await generateCluesAndAnswers(
            normalizedTopic,
            Math.min(Math.max(wordCount, 5), 10), // Keep small for speed
            normalizedDifficulty
        );

        if (!entries || entries.length < 3) {
            return res.status(200).json({
                ok: false,
                error: { code: 'INSUFFICIENT_WORDS', message: 'Could not generate enough words' }
            });
        }

        const layout = generateLayout(entries);
        const puzzle = toCrosswordJsFormat(layout, normalizedTopic);

        const limits = HINT_LIMITS[normalizedDifficulty];
        puzzle.difficulty = { level: normalizedDifficulty, hintLimits: { ...limits } };

        console.log('✅ Puzzle generated successfully');

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
