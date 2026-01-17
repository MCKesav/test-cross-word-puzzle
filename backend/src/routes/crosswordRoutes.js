import { Router } from 'express';
import { generateCluesAndAnswers, getDifficultyConfig } from '../services/geminiService.js';
import { generateLayout, toCrosswordJsFormat } from '../services/layoutService.js';
import { getCached, setCache, clearCache } from '../services/cacheService.js';
import {
    generateSemanticHint,
    getStrategicLetterReveal,
    checkHintAllowed,
    HINT_LIMITS
} from '../services/hintService.js';

const router = Router();

/**
 * POST /api/crossword/generate
 * Generate a new crossword puzzle for a given topic
 */
router.post('/generate', async (req, res) => {
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

        const cacheKey = `${normalizedTopic}:${normalizedDifficulty}`;
        const cached = await getCached(cacheKey);
        if (cached) {
            return res.json({ ...cached, cached: true });
        }

        const entries = await generateCluesAndAnswers(
            normalizedTopic,
            Math.min(Math.max(wordCount, 5), 20),
            normalizedDifficulty
        );

        if (entries.length < 3) {
            return res.status(422).json({
                error: 'Could not generate enough valid words for the crossword'
            });
        }

        const layout = generateLayout(entries);
        const puzzle = toCrosswordJsFormat(layout, normalizedTopic);

        // Add difficulty and hint configuration
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

        await setCache(cacheKey, puzzle);
        res.json({ ...puzzle, cached: false });

    } catch (error) {
        console.error('Generation error:', error);
        if (error.message.includes('API key')) {
            return res.status(500).json({ error: 'LLM API configuration error' });
        }
        if (error.message.includes('JSON')) {
            return res.status(502).json({ error: 'LLM returned invalid response' });
        }
        res.status(500).json({ error: 'Failed to generate crossword puzzle' });
    }
});

/**
 * POST /api/crossword/hint
 * Get a hint for a specific clue
 */
router.post('/hint', async (req, res) => {
    try {
        const {
            hintType,           // 'semantic' or 'letter'
            clue,               // The clue text
            answer,             // The correct answer
            userInput,          // Current user input for this word
            alreadyRevealed,    // Array of indices already revealed
            intersections,      // Object mapping indices to intersection info
            difficulty,         // Difficulty level
            usage               // Current usage counts
        } = req.body;

        // Validate required fields
        if (!hintType || !['semantic', 'letter'].includes(hintType)) {
            return res.status(400).json({ error: 'hintType must be "semantic" or "letter"' });
        }
        if (!answer) {
            return res.status(400).json({ error: 'answer is required' });
        }

        const normalizedDifficulty = (difficulty || 'medium').toLowerCase();
        const usageData = usage || { semanticForClue: 0, semanticTotal: 0, letterForClue: 0, letterTotal: 0 };

        // Check if hint is allowed
        const check = checkHintAllowed(hintType, normalizedDifficulty, usageData);
        if (!check.allowed) {
            return res.status(403).json({
                error: check.reason,
                limitReached: true
            });
        }

        let result;

        if (hintType === 'semantic') {
            // Generate semantic hint using LLM
            const hintText = await generateSemanticHint(clue || 'Unknown clue', answer);
            result = {
                type: 'semantic',
                hint: hintText,
                penalty: check.penalty
            };
        } else {
            // Generate strategic letter reveal
            const reveal = getStrategicLetterReveal(
                answer,
                userInput || '',
                alreadyRevealed || [],
                intersections || {}
            );

            if (!reveal) {
                return res.status(200).json({
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
                penalty: check.penalty
            };
        }

        res.json(result);

    } catch (error) {
        console.error('Hint error:', error);
        res.status(500).json({ error: 'Failed to generate hint' });
    }
});

/**
 * GET /api/crossword/hint-limits
 * Get hint limit configurations for all difficulty levels
 */
router.get('/hint-limits', (req, res) => {
    res.json({
        easy: {
            semanticHints: 'Unlimited per clue',
            letterReveals: '2 per clue',
            penalty: 'None'
        },
        medium: {
            semanticHints: '1 per clue',
            letterReveals: '1 per clue',
            penalty: '-5 points per hint'
        },
        hard: {
            semanticHints: '1 per puzzle',
            letterReveals: '1 per puzzle',
            penalty: '-15 points per hint'
        }
    });
});

/**
 * GET /api/crossword/difficulty
 */
router.get('/difficulty', (req, res) => {
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

/**
 * GET /api/crossword/topics
 */
router.get('/topics', (req, res) => {
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

/**
 * DELETE /api/crossword/cache
 */
router.delete('/cache', async (req, res) => {
    const result = await clearCache();
    res.json({ message: 'Cache cleared', ...result });
});

export default router;
