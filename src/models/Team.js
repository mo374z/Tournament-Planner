const mongoose = require('mongoose');
const { rankTeamsinController } = require('../controllers/RankingController');

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

async function rankTeams(teams, groupRank = false) {
    return await rankTeamsinController(teams, groupRank);     
}

async function getRank(team, groupRank = false) {
    let allTeams;
    if (groupRank) {
        allTeams = await Team.find({group: team.group}).exec();
    } else {
        allTeams = await Team.find({}).exec();
    }
    const sortedTeams = await rankTeams(allTeams, groupRank);
    const teamIndex = sortedTeams.findIndex(t => t._id.equals(team._id));
    return teamIndex + 1;
}

// Updated to work with the new ranking system
async function getTeamRank(rank) {
    const allTeams = await Team.find({}).exec();
    const sortedTeams = await rankTeams(allTeams, false);
    return sortedTeams[rank];
}

// Get a team at a specific rank within a group
async function getTeamGroupRank(rank, group) {
    const allTeamsInGroup = await Team.find({group: group}).exec();
    const sortedTeams = await rankTeams(allTeamsInGroup, true);
    return sortedTeams[rank];
}

async function getRankedTeams() {
    let allTeams = await Team.find({}).exec();
    allTeams.forEach(team => {
        team.goalDifference = team.goals[0] - team.goals[1];
    }); 
    allTeams = await rankTeams(allTeams, false);
    // Add index to each team
    allTeams.forEach((team, index) => {
        team.index = index + 1;
    });
    return allTeams;
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

function getAllTeamsInGroup(teams, group){
    return teams.filter(team => team.group === group); 
}

module.exports =  {
    getRank,
    getTeamRank,
    getTeamGroupRank,
    rankTeams,
    getAllGroupNames,
    getAllTeamsInGroup,
    getRankedTeams,
}