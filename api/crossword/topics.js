// Native Vercel Serverless Function for /api/crossword/topics

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    console.log('📋 Topics API HIT:', new Date().toISOString());

    return res.status(200).json({
        ok: true,
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
}
