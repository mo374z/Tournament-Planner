const mongoose = require('mongoose');

var TeamSchema = new mongoose.Schema({
    name: {
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
    goalsGroupStage: {
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
            x: { type: Number, default: 0.5 },
            y: { type: Number, default: 0.5 }
        },
        scale: { type: Number, default: 0.5 },      // scale factor for a 150x150 px Logo container
        backgroundColor: { type: String, default: '#f8f9fa' }
    },
    accessCode: {
        type: String,
    },
    accessCodeHash: {
        type: String,
    },
    finalPlacement: {
        type: Number,
        default: null
    },
    drinksCount: {
        weizen: { type: Number, default: 0 },
        pils: { type: Number, default: 0 },
        points: { type: Number, default: 0 }
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

        // Sort qualified teams based on overall performance, note that this is not necessarily equal to the final placement
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

        // Sort non-qualified teams based on group stage performance
        const sortedNonQualifiedTeams = nonQualifiedTeams.sort((a, b) => {
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

        // Combine the sorted lists - qualified teams will always be ranked 1-8
        return [...sortedQualifiedTeams, ...sortedNonQualifiedTeams];
    }
}

async function getRank(team, groupRank = false) {
    if (groupRank) {
        allTeams = await Team.find({ group: team.group }).exec();
    } else {
        allTeams = await Team.find({}).exec();
    }
    const sortedTeams = rankTeams(allTeams, groupRank);
    const teamIndex = sortedTeams.findIndex(t => t._id.equals(team._id));
    return teamIndex + 1;
}

async function updateFinalRanks() {
    const Game = mongoose.model('Game');

    // Find all placement games that have ended
    const placementGames = await Game.find({
        finalPlacement: { $ne: null },
        status: 'Ended'
    }).exec();

    // Update finalPlacement for each team that participated in a placement game
    for (const game of placementGames) {
        // Determine winner and loser
        const isTeam0Winner = game.goals[0] > game.goals[1];
        const winnerId = isTeam0Winner ? game.opponents[0] : game.opponents[1];
        const loserId = isTeam0Winner ? game.opponents[1] : game.opponents[0];

        // Winner gets finalPlacement, loser gets finalPlacement + 1
        await Team.findByIdAndUpdate(winnerId, { finalPlacement: game.finalPlacement });
        await Team.findByIdAndUpdate(loserId, { finalPlacement: game.finalPlacement + 1 });
    }
}



function getAllGroupNames(teams) {
    groupNames = [];
    for (const team of teams) {
        if (!groupNames.includes(team.group)) {
            groupNames.push(team.group);
        }
    }
    return groupNames;
}


function getAllTeamsInGroup(teams, group) {
    return teams.filter(team => team.group === group);
}

module.exports = {
    getRank,
    updateFinalRanks,
    rankTeams,
    getAllGroupNames,
    getAllTeamsInGroup,
}