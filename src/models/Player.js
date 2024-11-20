const mongoose = require('mongoose');


var PlayerSchema = new mongoose.Schema({
    name:{
        type: String,
    },
    number: {           // Number of the player (string weil Budetunier)
        type: String,
    },
    //total goals scored by the player in the tournament
    total_goals: {
        type: Number,
        required: true
    },
    goals: { // Array of goals scored by the player in each game (Game ID, timestampUnix, timestampGame(minute), seconds), timestamp, goals[](array of goals scored [1]: own team, [2]: opponent team), owngoal (boolean))
        type: Array,
        required: true
   },
    team: { // Team ID from MongoDB Team collection
        type: String,
        required: true      
    }
});

mongoose.model('Player', PlayerSchema);