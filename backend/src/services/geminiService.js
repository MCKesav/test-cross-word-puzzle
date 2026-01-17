import Bytez from 'bytez.js';

const apiKey = process.env.BYTEZ_API_KEY;

if (!apiKey || apiKey === 'your_api_key_here') {
  console.error('⚠️  WARNING: BYTEZ_API_KEY is not set in .env file!');
}

const sdk = new Bytez(apiKey);
const model = sdk.model('google/gemini-2.5-flash-lite');

/**
 * Difficulty level configurations
 */
const DIFFICULTY_CONFIG = {
  easy: {
    wordLengthMin: 3,
    wordLengthMax: 7,
    clueStyle: 'direct, simple definitions',
    wordType: 'common, everyday words',
    hintsAllowed: 'unlimited'
  },
  medium: {
    wordLengthMin: 4,
    wordLengthMax: 10,
    clueStyle: 'may use synonyms or indirect phrasing',
    wordType: 'mix of common and moderately difficult words',
    hintsAllowed: 'limited'
  },
  hard: {
    wordLengthMin: 6,
    wordLengthMax: 12,
    clueStyle: 'indirect, conceptual, or cryptic',
    wordType: 'domain-specific, technical, or rare terms',
    hintsAllowed: 'minimal'
  }
};

/**
 * Get difficulty configuration
 * @param {string} difficulty - easy, medium, or hard
 * @returns {Object} Difficulty configuration
 */
export function getDifficultyConfig(difficulty = 'medium') {
  return DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;
}

/**
 * Generate crossword clues and answers using Gemini 2.5 Flash-Lite via Bytez
 * @param {string} topic - The topic for crossword generation
 * @param {number} wordCount - Number of words to generate (default: 10)
 * @param {string} difficulty - Difficulty level: easy, medium, or hard
 * @returns {Promise<Array<{a: string, c: string}>>} Array of answer/clue pairs
 */
export async function generateCluesAndAnswers(topic, wordCount = 10, difficulty = 'medium') {
  const config = getDifficultyConfig(difficulty);

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

  console.log('📤 Sending request to Bytez API:', { topic, difficulty, wordCount });

  try {
    const { error, output } = await model.run([
      {
        role: 'user',
        content: prompt
      }
    ]);

    console.log('📥 Bytez API response received');

    if (error) {
      console.error('❌ Bytez API error:', error);
      throw new Error(`Bytez API error: ${JSON.stringify(error)}`);
    }

    // Extract text content from response - handle various response formats
    let responseText = '';

    if (typeof output === 'string') {
      responseText = output;
    } else if (Array.isArray(output)) {
      const lastMessage = output[output.length - 1];
      if (lastMessage?.content) {
        responseText = lastMessage.content;
      } else if (lastMessage?.text) {
        responseText = lastMessage.text;
      } else {
        responseText = JSON.stringify(output);
      }
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

    // Extract JSON array from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      console.error('❌ No JSON array found in response');
      throw new Error('No JSON array found in LLM response');
    }

    // Parse and validate JSON response
    const entries = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(entries)) {
      throw new Error('LLM response is not an array');
    }

    console.log('✅ Parsed', entries.length, 'entries from response');

    // Validate each entry based on difficulty constraints
    const validEntries = entries.map(entry => {
      if (!entry.a || !entry.c) {
        console.warn('⚠️  Skipping invalid entry:', entry);
        return null;
      }
      const answer = entry.a.toUpperCase().replace(/[^A-Z]/g, '');
      return {
        a: answer,
        c: entry.c.substring(0, 100)
      };
    }).filter(entry =>
      entry &&
      entry.a.length >= config.wordLengthMin &&
      entry.a.length <= config.wordLengthMax
    );

    console.log('✅ Returning', validEntries.length, 'valid entries for', difficulty, 'difficulty');
    return validEntries;

  } catch (err) {
    console.error('❌ Error in generateCluesAndAnswers:', err.message);
    throw err;
  }
}

/**
 * Generate a hint for a word (token-free, no LLM call)
 * @param {string} answer - The full answer
 * @param {number} hintLevel - Level of hint (1 = basic, 2 = more, 3 = most)
 * @returns {Object} Hint information
 */
export function generateHint(answer, hintLevel = 1) {
  const length = answer.length;
  const firstLetter = answer[0];
  const lastLetter = answer[length - 1];

  switch (hintLevel) {
    case 1:
      // Basic hint: first letter and length
      return {
        text: `Starts with "${firstLetter}" and has ${length} letters`,
        revealed: [0],
        penalty: 0
      };
    case 2:
      // Medium hint: first, last letter and length
      return {
        text: `Starts with "${firstLetter}", ends with "${lastLetter}" (${length} letters)`,
        revealed: [0, length - 1],
        penalty: 5
      };
    case 3:
      // Strong hint: first 2 letters and last letter
      const secondLetter = length > 1 ? answer[1] : '';
      return {
        text: `Starts with "${firstLetter}${secondLetter}..." ends with "${lastLetter}" (${length} letters)`,
        revealed: [0, 1, length - 1],
        penalty: 10
      };
    default:
      return {
        text: `${length} letters`,
        revealed: [],
        penalty: 0
      };
  }
}
