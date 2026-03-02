const mongoose = require('mongoose');

const symptomQuerySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  symptoms: { type: String, required: true, trim: true, maxlength: 2000 },
  duration: { type: String, trim: true },
  severity: { type: String, enum: ['mild', 'moderate', 'severe'] },
  additionalInfo: { type: String, trim: true, maxlength: 1000 },

  // AI Analysis Response
  analysis: {
    potentialConditions: [{
      condition: String,
      description: String,
      confidenceScore: Number,
      icdCode: String,
    }],
    severityRating: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'] },
    riskFactors: [String],
    recommendedActions: {
      homeRemedies: [String],
      whenToSeeDoctor: [String],
      emergencyGuidance: String,
    },
    disclaimer: String,
    rawResponse: String,
  },

  // User feedback
  helpfulnessRating: { type: Number, min: 1, max: 5 },
  userFeedback: { type: String, trim: true, maxlength: 500 },
  savedToHistory: { type: Boolean, default: true },

}, { timestamps: true });

symptomQuerySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('SymptomQuery', symptomQuerySchema);
