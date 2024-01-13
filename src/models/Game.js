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
    goals: {
      type: Array,
    },
    gamePhase: {
      type: String,
    },
    gameDisplayName: {
      type: String,
    },

});

mongoose.model('Game', GameSchema);