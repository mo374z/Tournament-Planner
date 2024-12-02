const mongoose = require('mongoose');

var CountersSchema = new mongoose.Schema({
    allGoals: {
        type: Number
    },
    gamesPlayed: {
        type: Number
    },
    goalSektCounter: {
        type: Number
    },
    wonSektBottles: {
        type: Number,
        default: 0
    }
});

mongoose.model('generalCounters', CountersSchema);