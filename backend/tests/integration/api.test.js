import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

const API_URL = 'http://localhost:3000/api/crossword';

describe('API Integration Tests', () => {

    it('GET /topics should return topic suggestions', async () => {
        const response = await fetch(`${API_URL}/topics`);
        assert.strictEqual(response.status, 200);

        const data = await response.json();
        assert.ok(Array.isArray(data.topics), 'Topics should be an array');
        assert.ok(data.topics.length > 0, 'Should have at least one topic');
    });

    it('POST /generate should require topic', async () => {
        const response = await fetch(`${API_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        assert.strictEqual(response.status, 400);

        const data = await response.json();
        assert.ok(data.error, 'Should have error message');
    });

    it('POST /generate should reject empty topic', async () => {
        const response = await fetch(`${API_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: '' })
        });

        assert.strictEqual(response.status, 400);
    });

    it('POST /generate should reject very short topic', async () => {
        const response = await fetch(`${API_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: 'A' })
        });

        assert.strictEqual(response.status, 400);
    });

    it('GET /health should return ok', async () => {
        const response = await fetch('http://localhost:3000/health');
        assert.strictEqual(response.status, 200);

        const data = await response.json();
        assert.strictEqual(data.status, 'ok');
        assert.ok(data.timestamp, 'Should have timestamp');
    });
});

// Note: Run with server started first:
// npm run dev &
// node --test tests/integration/api.test.js
