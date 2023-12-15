

// class Game {
//   constructor({ id, time, duration, status }) {
//     this.id = id;
//     this.time = time;
//     this.duration = duration;
//     this.status = status;
//     this.opponents = []; // list of length 2 containing Team objects
//     this.goals = []; // list of length 2 containing integers
//   }

//   getWinner() {
//     if (this.goals[0] > this.goals[1]) {
//       return this.opponents[0];
//     } else if (this.goals[1] > this.goals[0]) {
//       return this.opponents[1];
//     } else {
//       return null;
//     }
//   }

//   updateScore(team, goals) {
//     if (this.opponents.includes(team)) {
//       const index = this.opponents.indexOf(team);
//       this.goals[index] = goals;
//     }
//   }  


// }


const mongoose = require('mongoose');

var GameSchema = new mongoose.Schema({
    number:{
        type: Number
    },
    time: {
        type: Number,
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

});

mongoose.model('Game', GameSchema);