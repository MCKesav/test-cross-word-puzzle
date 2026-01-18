import 'dotenv/config';
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

// ============ ROUTES ============

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /api/crossword/topics
app.get('/api/crossword/topics', (req, res) => {
    res.json({
        topics: [
            'Programming',
            'Space Exploration',
            'World Geography',
            'Classical Music',
            'Marine Biology',
            'Ancient History',
            'Cooking & Food',
            'Sports',
            'Movies & Cinema',
            'Science & Technology'
        ]
    });
});

// GET /api/crossword/difficulty
app.get('/api/crossword/difficulty', (req, res) => {
    res.json({
        levels: [
            {
                id: 'easy',
                name: 'Easy',
                description: 'Common words, direct clues, generous hints',
                wordLength: '3-7 letters',
                hints: 'Unlimited clue hints, 2 letter reveals per clue'
            },
            {
                id: 'medium',
                name: 'Medium',
                description: 'Mixed difficulty, indirect clues, limited hints',
                wordLength: '4-10 letters',
                hints: '1 clue hint + 1 letter per clue (-5 pts each)'
            },
            {
                id: 'hard',
                name: 'Hard',
                description: 'Technical terms, cryptic clues, scarce hints',
                wordLength: '6-12 letters',
                hints: '1 clue hint + 1 letter per puzzle (-15 pts each)'
            }
        ]
    });
});

// POST /api/crossword/generate
app.post('/api/crossword/generate', async (req, res) => {
    try {
        const { topic, wordCount = 10, difficulty = 'medium' } = req.body;

        if (!topic || typeof topic !== 'string') {
            return res.status(400).json({
                error: 'Topic is required and must be a string'
            });
        }

        const validDifficulties = ['easy', 'medium', 'hard'];
        const normalizedDifficulty = (difficulty || 'medium').toLowerCase();
        if (!validDifficulties.includes(normalizedDifficulty)) {
            return res.status(400).json({
                error: 'Difficulty must be easy, medium, or hard'
            });
        }

        const normalizedTopic = topic.trim();
        if (normalizedTopic.length < 2 || normalizedTopic.length > 100) {
            return res.status(400).json({
                error: 'Topic must be between 2 and 100 characters'
            });
        }

        // Import services dynamically to handle Vercel cold starts
        const { generateCluesAndAnswers } = await import('../backend/src/services/geminiService.js');
        const { generateLayout, toCrosswordJsFormat } = await import('../backend/src/services/layoutService.js');

        const entries = await generateCluesAndAnswers(
            normalizedTopic,
            Math.min(Math.max(wordCount, 5), 20),
            normalizedDifficulty
        );

        if (!entries || entries.length < 3) {
            return res.status(422).json({
                error: 'Could not generate enough valid words for the crossword'
            });
        }

        const layout = generateLayout(entries);
        const puzzle = toCrosswordJsFormat(layout, normalizedTopic);

        // Add difficulty configuration
        const HINT_LIMITS = {
            easy: { semanticPerClue: -1, letterPerClue: 2, semanticPerPuzzle: -1, letterPerPuzzle: -1, penalty: 0 },
            medium: { semanticPerClue: 1, letterPerClue: 1, semanticPerPuzzle: -1, letterPerPuzzle: -1, penalty: 5 },
            hard: { semanticPerClue: 1, letterPerClue: 1, semanticPerPuzzle: 1, letterPerPuzzle: 1, penalty: 15 }
        };

        const limits = HINT_LIMITS[normalizedDifficulty];
        puzzle.difficulty = {
            level: normalizedDifficulty,
            hintLimits: {
                semanticPerClue: limits.semanticPerClue,
                letterPerClue: limits.letterPerClue,
                semanticPerPuzzle: limits.semanticPerPuzzle,
                letterPerPuzzle: limits.letterPerPuzzle,
                penalty: limits.penalty
            }
        };

        res.json({ ...puzzle, cached: false });

    } catch (error) {
        console.error('Generation error:', error);

        // Always return valid JSON
        if (error.message && error.message.includes('API key')) {
            return res.status(500).json({ error: 'LLM API configuration error. Check BYTEZ_API_KEY.' });
        }
        if (error.message && error.message.includes('JSON')) {
            return res.status(502).json({ error: 'LLM returned invalid response' });
        }

        res.status(500).json({
            error: 'Failed to generate crossword puzzle',
            details: process.env.NODE_ENV !== 'production' ? error.message : undefined
        });
    }
});

// POST /api/crossword/hint
app.post('/api/crossword/hint', async (req, res) => {
    try {
        const {
            hintType,
            clue,
            answer,
            userInput,
            alreadyRevealed,
            difficulty,
            usage
        } = req.body;

        if (!hintType || !['semantic', 'letter'].includes(hintType)) {
            return res.status(400).json({ error: 'hintType must be "semantic" or "letter"' });
        }
        if (!answer) {
            return res.status(400).json({ error: 'answer is required' });
        }

        const HINT_LIMITS = {
            easy: { semanticPerClue: -1, letterPerClue: 2, semanticPerPuzzle: -1, letterPerPuzzle: -1, penalty: 0 },
            medium: { semanticPerClue: 1, letterPerClue: 1, semanticPerPuzzle: -1, letterPerPuzzle: -1, penalty: 5 },
            hard: { semanticPerClue: 1, letterPerClue: 1, semanticPerPuzzle: 1, letterPerPuzzle: 1, penalty: 15 }
        };

        const normalizedDifficulty = (difficulty || 'medium').toLowerCase();
        const usageData = usage || { semanticForClue: 0, semanticTotal: 0, letterForClue: 0, letterTotal: 0 };
        const limits = HINT_LIMITS[normalizedDifficulty] || HINT_LIMITS.medium;

        // Check limits
        if (hintType === 'semantic') {
            if (limits.semanticPerClue !== -1 && usageData.semanticForClue >= limits.semanticPerClue) {
                return res.status(403).json({ error: 'Clue hint limit reached for this clue', limitReached: true });
            }
            if (limits.semanticPerPuzzle !== -1 && usageData.semanticTotal >= limits.semanticPerPuzzle) {
                return res.status(403).json({ error: 'Clue hint limit reached for this puzzle', limitReached: true });
            }
        } else {
            if (limits.letterPerClue !== -1 && usageData.letterForClue >= limits.letterPerClue) {
                return res.status(403).json({ error: 'Letter reveal limit reached for this clue', limitReached: true });
            }
            if (limits.letterPerPuzzle !== -1 && usageData.letterTotal >= limits.letterPerPuzzle) {
                return res.status(403).json({ error: 'Letter reveal limit reached for this puzzle', limitReached: true });
            }
        }

        let result;

        if (hintType === 'semantic') {
            // Generate semantic hint using LLM
            const { generateSemanticHint } = await import('../backend/src/services/hintService.js');
            const hintText = await generateSemanticHint(clue || 'Unknown clue', answer);
            result = {
                type: 'semantic',
                hint: hintText,
                penalty: limits.penalty
            };
        } else {
            // Generate letter reveal (code-based, no LLM)
            const { getStrategicLetterReveal } = await import('../backend/src/services/hintService.js');
            const reveal = getStrategicLetterReveal(
                answer,
                userInput || '',
                alreadyRevealed || [],
                {}
            );

            if (!reveal) {
                return res.json({
                    type: 'letter',
                    hint: null,
                    message: 'No more letters to reveal',
                    penalty: 0
                });
            }

            result = {
                type: 'letter',
                hint: {
                    index: reveal.index,
                    letter: reveal.letter
                },
                penalty: limits.penalty
            };
        }

        res.json(result);

    } catch (error) {
        console.error('Hint error:', error);
        res.status(500).json({ error: 'Failed to generate hint' });
    }
});

// Error handling - always return JSON
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler - always return JSON
app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.path });
});

// Export for Vercel serverless
export default app;
