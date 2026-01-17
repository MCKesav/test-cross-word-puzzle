import clg from 'crossword-layout-generator';

/**
 * Generate crossword grid layout from clues/answers
 * @param {Array<{a: string, c: string}>} entries - Array of {a: answer, c: clue}
 * @returns {Object} Crossword layout with grid and positioned words
 */
export function generateLayout(entries) {
    // Convert to format expected by crossword-layout-generator
    const inputWords = entries.map((entry, index) => ({
        answer: entry.a,
        clue: entry.c
    }));

    // Generate the layout
    const layout = clg.generateLayout(inputWords);

    // Transform to our output format
    return {
        width: layout.cols,
        height: layout.rows,
        grid: layout.table, // 2D array of characters
        words: layout.result.map((word, index) => ({
            id: index + 1,
            answer: word.answer,
            clue: word.clue,
            startX: word.startx,
            startY: word.starty,
            direction: word.orientation === 'across' ? 'across' : 'down',
            position: word.position
        })),
        unplacedWords: layout.result.filter(w => !w.startx).map(w => w.answer)
    };
}

/**
 * Convert layout to crosswords-js compatible format
 * @param {Object} layout - Generated layout
 * @param {string} topic - Original topic
 * @returns {Object} CrosswordDefinition for crosswords-js
 */
export function toCrosswordJsFormat(layout, topic) {
    const acrossClues = [];
    const downClues = [];

    layout.words.forEach(word => {
        const clueEntry = {
            number: word.position,
            clue: word.clue,
            answer: word.answer,
            x: word.startX,
            y: word.startY
        };

        if (word.direction === 'across') {
            acrossClues.push(clueEntry);
        } else {
            downClues.push(clueEntry);
        }
    });

    // Sort by position number
    acrossClues.sort((a, b) => a.number - b.number);
    downClues.sort((a, b) => a.number - b.number);

    return {
        meta: {
            title: `${topic} Crossword`,
            author: 'Auto Generator',
            date: new Date().toISOString().split('T')[0]
        },
        dimensions: {
            width: layout.width,
            height: layout.height
        },
        grid: layout.grid,
        clues: {
            across: acrossClues,
            down: downClues
        }
    };
}
