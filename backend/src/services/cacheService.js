import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const CACHE_DIR = path.join(process.cwd(), 'cache');
const CACHE_TTL_MS = (parseInt(process.env.CACHE_TTL_HOURS) || 24) * 60 * 60 * 1000;

/**
 * Generate cache key from topic
 */
function getCacheKey(topic) {
    const normalized = topic.toLowerCase().trim().replace(/\s+/g, '-');
    const hash = crypto.createHash('md5').update(normalized).digest('hex').substring(0, 8);
    return `${normalized}-${hash}`;
}

/**
 * Get cached puzzle if exists and not expired
 */
export async function getCached(topic) {
    if (process.env.CACHE_ENABLED !== 'true') return null;

    try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
        const cacheKey = getCacheKey(topic);
        const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);

        const stat = await fs.stat(cachePath);
        const age = Date.now() - stat.mtimeMs;

        if (age > CACHE_TTL_MS) {
            await fs.unlink(cachePath); // Delete expired cache
            return null;
        }

        const data = await fs.readFile(cachePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return null; // Cache miss
    }
}

/**
 * Store puzzle in cache
 */
export async function setCache(topic, puzzle) {
    if (process.env.CACHE_ENABLED !== 'true') return;

    try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
        const cacheKey = getCacheKey(topic);
        const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);

        await fs.writeFile(cachePath, JSON.stringify(puzzle, null, 2));
    } catch (error) {
        console.error('Cache write error:', error.message);
    }
}

/**
 * Clear all cached puzzles
 */
export async function clearCache() {
    try {
        const files = await fs.readdir(CACHE_DIR);
        await Promise.all(
            files.map(file => fs.unlink(path.join(CACHE_DIR, file)))
        );
        return { cleared: files.length };
    } catch (error) {
        return { cleared: 0 };
    }
}
