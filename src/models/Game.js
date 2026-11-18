const mongoose = require('mongoose');

var GameSchema = new mongoose.Schema({
    number:{
        type: Number
    },
    time: {
        type: Date,
    },
    duration: {
        type: String,
    },
    status: {
      type: String,
    },
    opponents: {
      type: Array,
    },
    goals: {  //goals[0] is opponents[0] and goals[1] is opponents[1]
      type: Array, 
    },
    goalsLog: [{ //goals array with timestamp, player which scored the goal, and new scoring (timestamp, player, new score array)
        timestamp: { type: Date, default: Date.now },
        gameTimestamp: { type: Number }, // Add gameTimestamp to the schema
        teamIndex: { type: Number },
        player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
        newScore: { type: Array },
        goalIndex: { type: Number },
        sekt_won: { type: Boolean },
        goalIndexTournament: { type: Number },
    }],
    gamePhase: {
      type: String,
    },
    gameDisplayName: {
      type: String,
    },
    extraTimeSeconds: { // played extra time (Nachspielzeit) in seconds
      type: Number, default: 0
    },
    penaltyShootout: {
      type: new mongoose.Schema({
        starter: { type: Number, required: true },
        kicks: [{
          _id: false,
          team: { type: Number, required: true },
          scored: { type: Boolean, required: true },
        }],
        finished: { type: Boolean, default: false },
        revision: { type: Number, default: 0 },
      }, { _id: false }),
      default: null,
    },
    finalPlacement:{
      type: Number, default: null
    },
    winnerPlacement: {
      type: Number, default: null
    },
    loserPlacement: {
      type: Number, default: null
    },
    matchId: { // Match-ID aus dem Schedule-Template (z.B. "QF1"); null bei Gruppenspielen/Custom-Spielen
      type: String, default: null
    }

});

mongoose.model('Game', GameSchema);