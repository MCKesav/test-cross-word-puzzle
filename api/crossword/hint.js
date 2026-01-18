// Native Vercel Serverless Function for /api/crossword/hint

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    console.log('💡 Hint API HIT:', new Date().toISOString());

    try {
        if (req.method !== 'POST') {
            return res.status(200).json({
                ok: false,
                error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST method' }
            });
        }

        const { hintType, clue, answer, userInput, alreadyRevealed, difficulty } = req.body || {};

        if (!hintType || !['semantic', 'letter'].includes(hintType)) {
            return res.status(200).json({
                ok: false,
                error: { code: 'INVALID_HINT_TYPE', message: 'hintType must be "semantic" or "letter"' }
            });
        }

        if (!answer) {
            return res.status(200).json({
                ok: false,
                error: { code: 'MISSING_ANSWER', message: 'answer is required' }
            });
        }

        const HINT_LIMITS = {
            easy: { penalty: 0 },
            medium: { penalty: 5 },
            hard: { penalty: 15 }
        };

        const normalizedDifficulty = (difficulty || 'medium').toLowerCase();
        const limits = HINT_LIMITS[normalizedDifficulty] || HINT_LIMITS.medium;

        let result;

        if (hintType === 'semantic') {
            // Simple semantic hint (no LLM call to avoid timeouts)
            const firstLetter = answer[0];
            const length = answer.length;
            result = {
                ok: true,
                type: 'semantic',
                hint: `Think about "${clue || 'the clue'}" - starts with "${firstLetter}" and has ${length} letters.`,
                penalty: limits.penalty
            };
        } else {
            // Letter reveal
            const answerArr = answer.toUpperCase().split('');
            const userArr = (userInput || '').toUpperCase().padEnd(answer.length, ' ').split('');
            const revealed = alreadyRevealed || [];

            const candidates = [];
            for (let i = 0; i < answerArr.length; i++) {
                if (revealed.includes(i)) continue;
                if (userArr[i] === answerArr[i]) continue;
                if (revealed.includes(i - 1) || revealed.includes(i + 1)) continue;
                candidates.push(i);
            }

            if (candidates.length === 0) {
                return res.status(200).json({
                    ok: true,
                    type: 'letter',
                    hint: null,
                    message: 'No more letters to reveal',
                    penalty: 0
                });
            }

            const chosenIndex = candidates[Math.floor(Math.random() * candidates.length)];
            result = {
                ok: true,
                type: 'letter',
                hint: { index: chosenIndex, letter: answerArr[chosenIndex] },
                penalty: limits.penalty
            };
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error('Hint error:', error.message);
        return res.status(200).json({
            ok: false,
            error: { code: 'HINT_FAILED', message: 'Failed to generate hint' }
        });
    }
}
