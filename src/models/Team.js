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
    points_Group_Stage: {
        type: Number,
    },
    points_General: {
        type: Number,
    },
    gamesPlayed_Group_Stage: {
        type: Number,
    },

});

const Team = mongoose.model('Team', TeamSchema);

async function getRank(team){
    const allTeamsInGroup = await Team.find({group: team.group}).exec();

    // Sort teams based on points, goal difference, and goals scored
    const sortedTeams = allTeamsInGroup.sort((a, b) => {
        if (a.points_Group_Stage !== b.points_Group_Stage) {
            return b.points_Group_Stage - a.points_Group_Stage;
        } else {
            const goalDifferenceA = a.goals[0] - a.goals[1];
            const goalDifferenceB = b.goals[0] - b.goals[1];

            if (goalDifferenceA !== goalDifferenceB) {
                return goalDifferenceB - goalDifferenceA;
            } else {
                return b.goals[0] - a.goals[0];
            }
        }
    });

    // Find the index of the current team in the sorted array to determine its rank
    const teamIndex = sortedTeams.findIndex(t => t._id.equals(team._id));
    return teamIndex + 1;
}

module.exports =  {
    getRank
}