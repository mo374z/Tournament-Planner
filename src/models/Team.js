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
    goalsGroupStage:{
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
    imagePath: {
        type: String,
    },
    //array of opponents the team has played against (maybe add this later)
    // opponents: {
    //     type: Array,
    // },

});

const Team = mongoose.model('Team', TeamSchema);

async function getRank(team, groupRank = false){
    const allTeamsInGroup = await Team.find({group: team.group}).exec();

    // Sort teams based on points, goal difference, and goals scored
    const sortedTeams = rankTeams(allTeamsInGroup, groupRank);

    // Find the index of the current team in the sorted array to determine its rank
    const teamIndex = sortedTeams.findIndex(t => t._id.equals(team._id));
    return teamIndex + 1;
}

// returns the overall rank of a team in the tournament
async function getTeamRank(rank){
    const allTeams = await Team.find({}).exec();
    const sortedTeams = rankTeams(allTeams);

    // return the team at the given rank
    return sortedTeams[rank];
}

// returns the rank of a team in a group
async function getTeamGroupRank(rank, group){
    const allTeamsInGroup = await Team.find({group: group}).exec();
    const sortedTeams = rankTeams(allTeamsInGroup, true);

    // return the team at the given rank
    return sortedTeams[rank];
}

function rankTeams(teams, groupRank = false){
    // Sort teams based on points, goal difference, and goals scored
    const sortedTeams = teams.sort((a, b) => {
        if (groupRank) {
            if (a.points_Group_Stage !== b.points_Group_Stage) {
                return b.points_Group_Stage - a.points_Group_Stage;
            } else {
                const goalDifferenceA = a.goalsGroupStage[0] - a.goalsGroupStage[1];
                const goalDifferenceB = b.goalsGroupStage[0] - b.goalsGroupStage[1];

                if (goalDifferenceA !== goalDifferenceB) {
                    return goalDifferenceB - goalDifferenceA;
                } else {
                    return b.goalsGroupStage[0] - a.goalsGroupStage[0];
                }
            }
        } else {
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
        }
    });

    return sortedTeams;
}

function getAllGroupNames(teams){
    groupNames = [];
    for (const team of teams) {
        if (!groupNames.includes(team.group)) {
            groupNames.push(team.group);
        }
    }
    return groupNames;
}

module.exports =  {
    getRank,
    getTeamRank,
    getTeamGroupRank,
    rankTeams,
    getAllGroupNames
}