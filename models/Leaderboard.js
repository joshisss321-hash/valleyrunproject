const mongoose = require('mongoose');

const leaderboardSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  distance: {
    type: Number,
    required: true
  },
  time: {
    type: String
  },
  rank: {
    type: Number
  },
  category: {
    type: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Leaderboard', leaderboardSchema);