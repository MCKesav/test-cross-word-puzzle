import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crosswordRoutes from './routes/crosswordRoutes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});

// Routes
app.use('/api/crossword', crosswordRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
// Start server only if not running in Vercel (serverless)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`🧩 Crossword Generator API running on http://localhost:${PORT}`);
        console.log(`   Cache: ${process.env.CACHE_ENABLED === 'true' ? 'enabled' : 'disabled'}`);
    });
}

export default app;
