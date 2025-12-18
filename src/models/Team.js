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
    logo: {
        path: { type: String, default: '/teamlogos/default_logo.png' },
        position: {
            x: { type: Number, default: 50 },
            y: { type: Number, default: 50 }
        },
        scale: { type: Number, default: 0.5 },
        backgroundColor: { type: String, default: '#f8f9fa' }
    },
    //array of opponents the team has played against (maybe add this later)
    // opponents: {
    //     type: Array,
    // },

});

const Team = mongoose.model('Team', TeamSchema);

function rankTeams(teams, groupRank = false) {
    if (groupRank) {
        // For group ranking, use the existing logic
        return teams.sort((a, b) => {
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
        });
    } else {
        // For overall ranking, first get qualified teams (top 2 from each group)
        const groupedTeams = {};
        const qualifiedTeams = [];
        const nonQualifiedTeams = [];

        // Group teams by their group
        teams.forEach(team => {
            if (!groupedTeams[team.group]) {
                groupedTeams[team.group] = [];
            }
            groupedTeams[team.group].push(team);
        });

        // For each group, get top 2 teams
        Object.values(groupedTeams).forEach(groupTeams => {
            // Sort teams within group
            const sortedGroupTeams = groupTeams.sort((a, b) => {
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
            });

            // Add top 2 to qualified teams
            qualifiedTeams.push(...sortedGroupTeams.slice(0, 2));
            // Add rest to non-qualified teams
            nonQualifiedTeams.push(...sortedGroupTeams.slice(2));
        });

        // Sort qualified teams based on overall performance
        const sortedQualifiedTeams = qualifiedTeams.sort((a, b) => {
            if (a.points_General !== b.points_General) {
                return b.points_General - a.points_General;
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

        // Sort non-qualified teams based on overall performance
        const sortedNonQualifiedTeams = nonQualifiedTeams.sort((a, b) => {
            if (a.points_General !== b.points_General) {
                return b.points_General - a.points_General;
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

        // Combine the sorted lists - qualified teams will always be ranked 1-8
        return [...sortedQualifiedTeams, ...sortedNonQualifiedTeams];
    }
}

async function getRank(team, groupRank = false) {
    if (groupRank) {
        allTeams = await Team.find({group: team.group}).exec();
    } else {
        allTeams = await Team.find({}).exec();
    }
    const sortedTeams = rankTeams(allTeams, groupRank);
    const teamIndex = sortedTeams.findIndex(t => t._id.equals(team._id));
    return teamIndex + 1;
}

// Updated to work with the new ranking system
async function getTeamRank(rank) {
    const allTeams = await Team.find({}).exec();
    const sortedTeams = rankTeams(allTeams, false);
    return sortedTeams[rank];
}

// Get a team at a specific rank within a group
async function getTeamGroupRank(rank, group) {
    const allTeamsInGroup = await Team.find({group: group}).exec();
    const sortedTeams = rankTeams(allTeamsInGroup, true);
    return sortedTeams[rank];
}

async function getRankedTeams() {
    let allTeams = await Team.find({}).exec();
    allTeams.forEach(team => {
        team.goalDifference = team.goals[0] - team.goals[1];
    }); 
    allTeams = rankTeams(allTeams, false);
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