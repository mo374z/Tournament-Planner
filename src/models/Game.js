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

});

mongoose.model('Game', GameSchema);