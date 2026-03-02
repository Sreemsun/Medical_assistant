const express = require('express');
const OpenAI = require('openai');
const SymptomQuery = require('../models/SymptomQuery');
const { protect } = require('../middleware/auth');
const { symptomLimiter } = require('../middleware/rateLimiter');
const { validateSymptoms } = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();

const SYSTEM_PROMPT = `You are a medical information assistant. Your role is to provide general health information based on described symptoms. Always emphasize that this is NOT a medical diagnosis and users MUST consult a licensed healthcare professional for actual medical advice. Be thorough, compassionate, and accurate.

Respond ONLY with valid JSON matching this exact structure (no markdown, no code fences — raw JSON only):
{
  "potentialConditions": [
    {"condition": "string", "description": "string", "confidenceScore": 0-100, "icdCode": "optional string"}
  ],
  "severityRating": "Low|Medium|High|Critical",
  "riskFactors": ["string"],
  "recommendedActions": {
    "homeRemedies": ["string"],
    "whenToSeeDoctor": ["string"],
    "emergencyGuidance": "string"
  },
  "disclaimer": "string"
}`;

// ── Groq client (lazy init, uses OpenAI-compatible API) ───────
let groqClient = null;
const getGroq = () => {
  if (!groqClient) {
    if (!process.env.GROQ_API_KEY) throw new Error('Groq API key not configured.');
    groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }
  return groqClient;
};

// All routes require authentication
router.use(protect);

// ── POST /api/symptoms/analyze ────────────────────────────────
router.post('/analyze', symptomLimiter, validateSymptoms, async (req, res) => {
  try {
    const { symptoms, duration, severity, additionalInfo } = req.body;
    const prompt = buildSymptomPrompt(symptoms, duration, severity, additionalInfo, req.user);

    let analysis;
    try {
      const client = getGroq();
      const completion = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      });
      const rawResponse = completion.choices[0].message.content;
      analysis = JSON.parse(rawResponse);
      analysis.rawResponse = rawResponse;
    } catch (aiErr) {
      logger.warn(`Groq error (using fallback): ${aiErr.message}`);
      analysis = buildFallbackAnalysis(symptoms, severity);
    }

    // Save query to database
    const query = await SymptomQuery.create({
      user: req.user._id,
      symptoms,
      duration,
      severity,
      additionalInfo,
      analysis,
    });

    res.json({ success: true, queryId: query._id, analysis });
  } catch (err) {
    logger.error(`Symptom analysis error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Analysis failed. Please try again.' });
  }
});

// ── GET /api/symptoms/history ─────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [queries, total] = await Promise.all([
      SymptomQuery.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-analysis.rawResponse'),
      SymptomQuery.countDocuments({ user: req.user._id }),
    ]);

    res.json({
      success: true,
      queries,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch history.' });
  }
});

// ── GET /api/symptoms/:id ─────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const query = await SymptomQuery.findOne({ _id: req.params.id, user: req.user._id });
    if (!query) return res.status(404).json({ success: false, message: 'Query not found.' });
    res.json({ success: true, query });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch query.' });
  }
});

// ── POST /api/symptoms/:id/rate ───────────────────────────────
router.post('/:id/rate', async (req, res) => {
  try {
    const { helpfulnessRating, userFeedback } = req.body;
    if (!helpfulnessRating || helpfulnessRating < 1 || helpfulnessRating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
    }
    const query = await SymptomQuery.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { helpfulnessRating, userFeedback },
      { new: true }
    );
    if (!query) return res.status(404).json({ success: false, message: 'Query not found.' });
    res.json({ success: true, message: 'Rating saved. Thank you for your feedback!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save rating.' });
  }
});

// ── DELETE /api/symptoms/:id ──────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const query = await SymptomQuery.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!query) return res.status(404).json({ success: false, message: 'Query not found.' });
    res.json({ success: true, message: 'Symptom query deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete query.' });
  }
});

// ─── Helpers ──────────────────────────────────────────────────
function buildSymptomPrompt(symptoms, duration, severity, additionalInfo, user) {
  const parts = [`Patient describes the following symptoms: ${symptoms}`];
  if (duration) parts.push(`Duration: ${duration}`);
  if (severity) parts.push(`Self-reported severity: ${severity}`);
  if (user.age) parts.push(`Patient age: ${user.age}`);
  if (user.gender) parts.push(`Patient gender: ${user.gender}`);
  if (user.chronicConditions?.length) parts.push(`Known chronic conditions: ${user.chronicConditions.join(', ')}`);
  if (user.allergies?.length) parts.push(`Known allergies: ${user.allergies.map(a => a.allergen).join(', ')}`);
  if (additionalInfo) parts.push(`Additional information: ${additionalInfo}`);
  return parts.join('\n');
}

function buildFallbackAnalysis(symptoms, severity) {
  return {
    potentialConditions: [
      {
        condition: 'Unable to analyze — AI service unavailable',
        description: 'The AI analysis service is currently unavailable. Please consult a healthcare professional directly.',
        confidenceScore: 0,
      },
    ],
    severityRating: severity === 'severe' ? 'High' : 'Medium',
    riskFactors: ['AI service unavailable — seek professional medical advice'],
    recommendedActions: {
      homeRemedies: ['Rest and stay hydrated', 'Monitor your symptoms closely'],
      whenToSeeDoctor: [
        'If symptoms persist for more than 24–48 hours',
        'If symptoms worsen or new symptoms develop',
        'If you experience severe pain, difficulty breathing, or chest pain',
      ],
      emergencyGuidance: 'Call emergency services (911) immediately if you experience severe chest pain, difficulty breathing, sudden confusion, or any life-threatening symptoms.',
    },
    disclaimer: 'This is NOT a medical diagnosis. The AI service is currently unavailable. Please consult a qualified healthcare professional for proper medical advice, diagnosis, and treatment.',
  };
}

module.exports = router;
