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

});

mongoose.model('generalCounters', CountersSchema);