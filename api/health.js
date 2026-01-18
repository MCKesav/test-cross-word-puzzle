// Native Vercel Serverless Function for /api/health

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    console.log('❤️ Health check:', new Date().toISOString());

    return res.status(200).json({
        ok: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        hasApiKey: !!process.env.BYTEZ_API_KEY
    });
}
