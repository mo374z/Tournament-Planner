const mongoose = require('mongoose');

var TeamSchema = new mongoose.Schema({
    name:{
        type: String,
        required: 'This field is required'
    },
    group: {
        type: String,
        required: 'This field is required'
    },
    gamesPlayed: {
        type: Number,
    },
    gamesWon: {
        type: Number,
    },
    gamesLost: {
        type: Number,
    },
    gamesDraw: {
        type: Number,
    },
    goals: { // Tore (geschossene Tore [0] - erhaltene Tore[1])
        type: Array,
    },
    sektWon: {
        type: Number,
    },
    points: {
        type: Number,
    },

});

mongoose.model('Team', TeamSchema);