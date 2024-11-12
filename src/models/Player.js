const mongoose = require('mongoose');



var PlayerSchema = new mongoose.Schema({
    name:{
        type: String,
        required: true
    },
    number: {
        type: Number,
        required: true
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

const Player = mongoose.model('Player', PlayerSchema);





// import Team from './Team';

// // This function will be used for later versions of the application
// class Player {
//   constructor(name, color) {
//     this.name = name;
//     this.number = "";
//     this.goals = 0;
//     this.team = Team;
//   }

//     score() {
//         this.goals++;
//     }

//     getGoals() {
//         return this.goals;
//     }

//     getTeam() {
//         return this.team;
//     }

//     setTeam(team) {
//         this.team = team;
//     }
// }

