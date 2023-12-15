// class Team {
//   constructor(name, group, goals) {
//     this.name = name;
//     this.group = group;
//     this.goals = goals;
//    // this.pictureID = ID;
//     this.players = [];
//   }

//     addPlayer(player) {
//         this.players.push(player);
//     }

//     getPlayerByName(name) {
//         return this.players.find(player => player.name === name);
//     }
// }


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
    goals: {
        type: Number,
        required: 'This field is required'
    }

});

mongoose.model('Team', TeamSchema);