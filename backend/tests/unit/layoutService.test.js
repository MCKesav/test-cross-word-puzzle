import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateLayout, toCrosswordJsFormat } from '../../src/services/layoutService.js';

describe('layoutService', () => {
    const testEntries = [
        { a: 'PYTHON', c: 'Programming language' },
        { a: 'CODE', c: 'Instructions' },
        { a: 'DEBUG', c: 'Fix errors' },
        { a: 'LOOP', c: 'Repeat' },
        { a: 'ARRAY', c: 'Collection' }
    ];

    it('should generate a valid layout', () => {
        const layout = generateLayout(testEntries);

        assert.ok(layout.width > 0, 'Width should be > 0');
        assert.ok(layout.height > 0, 'Height should be > 0');
        assert.ok(Array.isArray(layout.grid), 'Grid should be an array');
        assert.ok(Array.isArray(layout.words), 'Words should be an array');
    });

    it('should place at least some words', () => {
        const layout = generateLayout(testEntries);

        assert.ok(layout.words.length >= 1, 'At least 1 word should be placed');
    });

    it('should convert to crosswords-js format', () => {
        const layout = generateLayout(testEntries);
        const formatted = toCrosswordJsFormat(layout, 'Test Topic');

        assert.strictEqual(formatted.meta.title, 'Test Topic Crossword');
        assert.strictEqual(formatted.dimensions.width, layout.width);
        assert.strictEqual(formatted.dimensions.height, layout.height);
        assert.ok(formatted.clues.across || formatted.clues.down, 'Should have clues');
    });

    it('should have correct word properties', () => {
        const layout = generateLayout(testEntries);

        layout.words.forEach(word => {
            assert.ok(word.answer, 'Word should have answer');
            assert.ok(word.clue, 'Word should have clue');
            assert.ok(word.direction === 'across' || word.direction === 'down', 'Direction should be across or down');
            assert.ok(typeof word.startX === 'number', 'startX should be a number');
            assert.ok(typeof word.startY === 'number', 'startY should be a number');
        });
    });
});
