const mongoose = require('mongoose');

var TeamSchema = new mongoose.Schema({
    name: {
        type: String,
        required: 'This field is required'
    },
    group: {
        type: String,
        default: ''
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

// Rang eines Teams (in der Gruppe oder gesamt) nach den Regeln des gewählten Templates.
// Gesamtrang ist erst nach der Gruppenphase bekannt, davor wird nach Gruppenwerten sortiert.
async function getRank(team, groupRank = false) {
    const { loadTemplate } = require('../services/tournamentTemplate');
    const rules = require('../services/tournamentRules');
    const settings = await mongoose.model('MainSettings').findOne({}).lean().exec();
    const template = loadTemplate(settings && settings.scheduleTemplate, { validate: false });
    const teams = await Team.find({}).lean().exec();
    const games = await mongoose.model('Game').find({}).lean().exec();
    const decisions = await mongoose.model('Decision').find({ status: 'resolved' }).lean().exec();
    const ctx = rules.buildContext(template, teams, games, decisions);

    let list = groupRank ? ctx.tables[team.group] : ctx.overall;
    if (!list) {
        const points = (template.group_stage && template.group_stage.points) || { win: 3, draw: 1, loss: 0 };
        const getStats = rules.computeStats(games, (template.group_stage || {}).game_phase_key, points);
        list = rules.sortTeams(teams, ['points', 'goal_difference', 'goals_scored'], getStats, [], points);
    }
    const index = (list || []).findIndex(t => String(t._id) === String(team._id));
    return index + 1;
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
        const isTeam0Winner = game.goals[0] >= game.goals[1]; // bei Gleichstand gewinnt das erste Team (wie im Spielplan)
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
    getAllGroupNames,
    getAllTeamsInGroup,
}