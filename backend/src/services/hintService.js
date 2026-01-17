import Bytez from 'bytez.js';

const apiKey = process.env.BYTEZ_API_KEY;
const sdk = new Bytez(apiKey);
const model = sdk.model('google/gemini-2.5-flash-lite');

/**
 * Hint type configurations per difficulty
 */
export const HINT_LIMITS = {
    easy: {
        semanticPerClue: -1,      // Unlimited
        letterPerClue: 2,
        semanticPerPuzzle: -1,    // Unlimited
        letterPerPuzzle: -1,      // Unlimited
        penalty: 0
    },
    medium: {
        semanticPerClue: 1,
        letterPerClue: 1,
        semanticPerPuzzle: -1,
        letterPerPuzzle: -1,
        penalty: 5                // Minor score reduction per hint
    },
    hard: {
        semanticPerClue: 1,
        letterPerClue: 1,
        semanticPerPuzzle: 1,     // Only 1 semantic hint for entire puzzle
        letterPerPuzzle: 1,       // Only 1 letter reveal for entire puzzle
        penalty: 15               // Major score reduction per hint
    }
};

/**
 * Generate a semantic hint using LLM
 * Rephrases/expands clue without revealing answer
 * @param {string} clue - The original clue
 * @param {string} answer - The answer (used to avoid revealing it)
 * @returns {Promise<string>} Semantic hint text
 */
export async function generateSemanticHint(clue, answer) {
    const prompt = `Given the crossword clue:
"${clue}"

And the answer:
"${answer}"

Generate ONE short semantic hint that helps understanding without revealing the answer or obvious synonyms.

Output ONLY the sentence.`;

    try {
        const { error, output } = await model.run([
            { role: 'user', content: prompt }
        ]);

        if (error) {
            console.error('Semantic hint error:', error);
            return `Think about: ${clue.toLowerCase()}`;
        }

        // Extract text from response
        let hintText = '';
        if (typeof output === 'string') {
            hintText = output;
        } else if (Array.isArray(output) && output[output.length - 1]?.content) {
            hintText = output[output.length - 1].content;
        } else if (output?.content) {
            hintText = output.content;
        } else {
            hintText = String(output);
        }

        // Clean up the response
        hintText = hintText.trim().replace(/^["']|["']$/g, '');

        // Validate hint doesn't contain the answer
        if (hintText.toUpperCase().includes(answer.toUpperCase())) {
            return `Consider what "${clue}" might be describing.`;
        }

        return hintText;
    } catch (err) {
        console.error('Semantic hint generation failed:', err.message);
        return `Think about what "${clue}" could mean.`;
    }
}

/**
 * Strategic letter reveal - reveals a helpful letter
 * @param {string} answer - Full correct answer
 * @param {string} userInput - User's current input for this word
 * @param {number[]} alreadyRevealed - Indices of already revealed letters
 * @param {Object} intersections - Map of indices that intersect with other words
 * @returns {Object|null} {index, letter} or null if no valid reveal
 */
export function getStrategicLetterReveal(answer, userInput = '', alreadyRevealed = [], intersections = {}) {
    const answerArr = answer.toUpperCase().split('');
    const userArr = (userInput || '').toUpperCase().padEnd(answer.length, ' ').split('');

    // Find indices that are wrong or empty AND not already revealed
    const candidateIndices = [];

    for (let i = 0; i < answerArr.length; i++) {
        // Skip if already revealed
        if (alreadyRevealed.includes(i)) continue;

        // Skip if user already has correct letter
        if (userArr[i] === answerArr[i]) continue;

        // Skip if adjacent to an already revealed letter (no consecutive reveals)
        if (alreadyRevealed.includes(i - 1) || alreadyRevealed.includes(i + 1)) continue;

        candidateIndices.push(i);
    }

    if (candidateIndices.length === 0) {
        return null; // No valid letters to reveal
    }

    // Prioritize intersection letters (letters that help other words)
    const intersectionCandidates = candidateIndices.filter(i => intersections[i]);

    let chosenIndex;
    if (intersectionCandidates.length > 0) {
        // Pick a random intersection letter
        chosenIndex = intersectionCandidates[Math.floor(Math.random() * intersectionCandidates.length)];
    } else {
        // Pick a random candidate from non-intersection letters
        chosenIndex = candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
    }

    return {
        index: chosenIndex,
        letter: answerArr[chosenIndex]
    };
}

/**
 * Check if hint is allowed based on difficulty limits
 * @param {string} hintType - 'semantic' or 'letter'
 * @param {string} difficulty - 'easy', 'medium', 'hard'
 * @param {Object} usage - Current usage counts
 * @returns {Object} {allowed: boolean, reason: string}
 */
export function checkHintAllowed(hintType, difficulty, usage) {
    const limits = HINT_LIMITS[difficulty] || HINT_LIMITS.medium;

    if (hintType === 'semantic') {
        // Check per-clue limit
        if (limits.semanticPerClue !== -1 && usage.semanticForClue >= limits.semanticPerClue) {
            return { allowed: false, reason: 'Clue hint limit reached for this clue' };
        }
        // Check per-puzzle limit (for hard mode)
        if (limits.semanticPerPuzzle !== -1 && usage.semanticTotal >= limits.semanticPerPuzzle) {
            return { allowed: false, reason: 'Clue hint limit reached for this puzzle' };
        }
    } else if (hintType === 'letter') {
        // Check per-clue limit
        if (limits.letterPerClue !== -1 && usage.letterForClue >= limits.letterPerClue) {
            return { allowed: false, reason: 'Letter reveal limit reached for this clue' };
        }
        // Check per-puzzle limit (for hard mode)
        if (limits.letterPerPuzzle !== -1 && usage.letterTotal >= limits.letterPerPuzzle) {
            return { allowed: false, reason: 'Letter reveal limit reached for this puzzle' };
        }
    }

    return { allowed: true, penalty: limits.penalty };
}
