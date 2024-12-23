const express = require('express');
var router = express.Router();

const mongoose = require('mongoose');
const Team = mongoose.model('Team');
const Game = mongoose.model('Game');
const Player = mongoose.model('Player');
const MainSettings = mongoose.model('MainSettings');

const { verifyToken, authorizeRoles } = require('../middleware/auth');
const cookieParser = require('cookie-parser');
router.use(cookieParser());

router.use(verifyToken);
router.use(authorizeRoles('admin')); // Nur Admins haben Zugriff auf die Teamverwaltung
router.use((req, res, next) => { 
    res.locals.username = req.username;
    res.locals.userrole = req.userRole;
    next();
});

const { getRank } = require('../models/Team');

const multer = require('multer'); // For file upload
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/teampictures/');
    },
    filename: function (req, file, cb) {
        cb(null, req.body._id + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

router.post('/uploadImage', upload.single('teamImage'), async (req, res) => {
    try {
        const team = await Team.findById(req.body._id).exec();
        if (team) {
            team.imagePath = '/teampictures/' + req.file.filename;
            await team.save();
            console.log('Image uploaded successfully:', req.file.filename);
            res.redirect('/team/details/' + req.body._id);
        } else {
            console.log('Team not found for ID:', req.body._id);
            res.status(404).send('Team not found');
        }
    } catch (err) {
        console.log('Error during image upload:', err);
        res.status(500).send('Internal Server Error');
    }
});


router.post('/deleteImage', async (req, res) => {
    try {
        console.log('Deleting image for team ID:', req.body._id);
        const team = await Team.findById(req.body._id).exec();
        if (team && team.imagePath) {
            const imagePath = path.join(__dirname, '../../public', team.imagePath);
            fs.unlink(imagePath, async (err) => {
                if (err) {
                    console.log('Error deleting image:', err);
                    res.status(500).send('Internal Server Error');
                } else {
                    team.imagePath = null;
                    await team.save();
                    console.log('Image deleted successfully');
                    res.redirect('/team/details/' + req.body._id);
                }
            });
        } else {
            console.log('Team or image not found for ID:', req.body._id);
            res.status(404).send('Team or image not found');
        }
    } catch (err) {
        console.log('Error during image deletion:', err);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/list', async (req, res) => {
    try {
        const Teams = await Team.find({});
        const mainSettings = await MainSettings.findOne({});
        const groups = mainSettings ? mainSettings.groups : [];
        
        Teams.forEach(async team => {
            team.index = Teams.indexOf(team) + 1;
            team.goalsDifference = team.goals[0] - team.goals[1];
            team.goalsDifferenceGroupStage = team.goalsGroupStage[0] - team.goalsGroupStage[1];
            team.rank = await getRank(team);
        });

        res.render('layouts/teamlist', {
            list: Teams,
            groups: groups,
        });
    } catch (err) {
        console.log('Error in retrieval: ' + err);
    }
});

router.post('/add', async (req, res) => {
    try {
        const { name, group, newGroup } = req.body;
        const teamGroup = group === 'Neu' ? newGroup : group;

        const team = new Team({
            name: name,
            group: teamGroup,
            gamesPlayed: 0,
            gamesWon: 0,
            gamesLost: 0,
            gamesDraw: 0,
            goals: [0, 0],
            goalsGroupStage: [0, 0],
            sektWon: 0,
            points_Group_Stage: 0,
            points_General: 0,
            gamesPlayed_Group_Stage: 0,
        });

        await team.save();
        res.redirect('/team/list');
    } catch (err) {
        console.log('Error during insert: ' + err);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/grouplist', async (req, res) => {
    try {
        const teamsByGroup = await getTeamsByGroup();

        res.render('layouts/grouplist', {
            teamsByGroup,
        });
    } catch (err) {
        console.log('Error in retrieval: ' + err);
    }
});


function getTeamsByGroup() {
    return new Promise(async (resolve, reject) => {
        try {
            const teamsByGroup = await Team.aggregate([
                {
                    $group: {
                        _id: "$group",
                        teams: {
                            $push: {
                                _id: "$_id",
                                name: "$name",
                                group: "$group",
                                rank: { $literal: null }, // Placeholder for rank
                                gamesPlayed: "$gamesPlayed",
                                gamesPlayed_Group_Stage: "$gamesPlayed_Group_Stage",
                                points_General: "$points_General",
                                points_Group_Stage: "$points_Group_Stage",
                                goalsDifference: {
                                    $subtract: [
                                        { $arrayElemAt: ["$goals", 0] },
                                        { $arrayElemAt: ["$goals", 1] }
                                    ]
                                },
                                goalsDifferenceGroupStage: {
                                    $subtract: [
                                        { $arrayElemAt: ["$goalsGroupStage", 0] },
                                        { $arrayElemAt: ["$goalsGroupStage", 1] }
                                    ]
                                },
                                goals: "$goals", // [goalsFor, goalsAgainst],
                                goalsGroupStage: "$goalsGroupStage",
                            }
                        }
                    }
                },
                {
                    $project: {
                        groupName: "$_id",
                        teams: 1,
                        _id: 0
                    }
                },
                {
                    $sort: {
                        groupName: 1 // Sort by group name
                    }
                }
            ]);

            await updateRanks(teamsByGroup);

            // Sort groups based on the first team's rank in each group
            teamsByGroup.sort((a, b) => {
                if (a.teams.length > 0 && b.teams.length > 0) {
                    return a.teams[0].rank - b.teams[0].rank;
                }
                return 0;
            });

            resolve(teamsByGroup);
        } catch (err) {
            reject(err);
        }
    });
}



  


router.get('/clearTeamCounters', authorizeRoles('admin'), async (req, res) => {   //Clear Team Counters only for Admins
    try {
        const teams = await Team.find({}).exec();
        teams.forEach(async team => {
            team.gamesPlayed = 0;
            team.gamesWon = 0;
            team.gamesLost = 0;
            team.gamesDraw = 0;
            team.goals = [0,0];  
            team.goalsGroupStage = [0,0];   
            team.sektWon = 0;
            team.points_Group_Stage = 0;
            team.points_General = 0;
            team.gamesPlayed_Group_Stage = 0;
            await team.save();
        });
        res.redirect('/team/list');
    } catch (err) {
        console.log('Error in deletion: ' + err);
        res.status(500).send('Internal Server Error');
    }
});


router.get('/delete/:id' , authorizeRoles('admin'), async (req, res) => {   //Delete Team only for Admins
    try {
        const deletedTeam = await Team.findByIdAndDelete(req.params.id).exec();
        if (deletedTeam) {
            res.redirect('/team/list');
        } else {
            res.status(404).send('Student not found');
        }
    } catch (err) {
        console.log('Error in deletion: ' + err);
        res.status(500).send('Internal Server Error');
    }
});

// return the team ID based on the id
router.get('/getTeamName/:id', async (req, res) => {
    try {
        if(req.params.isDummy){
            res.status(200).send(req.params.name);
        }
        else{
            const team = await Team.findById(req.params.id).exec();
    
            if (team) {
                res.status(200).send(team.name);     // return the team name
            }
            else {
                res.status(404).send('Team not found');
            }
    
        }
    } catch (err) {
        console.log('Error: ' + err);
        res.status(500).send('Internal Server Error');
    }
});

// return the current rank of the team within the group
// the rank is based on the points, goal difference, and goals scored (in this order)
router.get('/getTeamRank/:id', async (req, res) => {
    try {
        const team = await Team.findById(req.params.id).exec();

        if (team) {
            res.status(200).send({ rank: getRank(team)});
        } else {
            res.status(404).send('Team not found');
        }
    } catch (err) {
        console.log('Error: ' + err);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/details/:id', async (req, res) => {
    try {
        const team = await Team.findById(req.params.id).exec();
        if (team) {
            const players = await Player.find({ team: team._id }).exec();
            const goals = await getGoalsForTeam(team._id);
            const upcomingGames = await getUpcomingGamesForTeam(team._id);
            const pastGames = await getPastGamesForTeam(team._id);
            const tournamentRank = await getRank(team);
            const groupRank = await getRank(team, true);
            res.render('layouts/teamDetails', {
                viewTitle: "Team Details: " + team.name,
                team: team,
                players: players,
                goals: goals,
                upcomingGames: upcomingGames,
                pastGames: pastGames,
                tournamentRank: tournamentRank,
                groupRank: groupRank,
                imagePath: team.imagePath || '/teampictures/default.jpg',
            });
        } else {
            res.status(404).send('Team not found');
        }
    } catch (err) {
        console.log('Error: ' + err);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/updateName', async (req, res) => {
    try {
        const { _id, name } = req.body;
        const team = await Team.findById(_id).exec();
        if (team) {
            team.name = name;
            await team.save();
            console.log('Team name updated successfully:', name);
            res.redirect('/team/details/' + _id);
        } else {
            console.log('Team not found for ID:', _id);
            res.status(404).send('Team not found');
        }
    } catch (err) {
        console.log('Error during team name update:', err);
        res.status(500).send('Internal Server Error');
    }
});

async function getUpcomingGamesForTeam(teamId) {
    const games = await Game.find({ "opponents": teamId, "status": { $in: ["Scheduled", "active"] } }).exec();
    return Promise.all(games.map(async game => {
        const opponents = await Promise.all(game.opponents.map(async opponentId => {
            const team = await Team.findById(opponentId).exec();
            return team ? { id: team._id, name: team.name } : { id: opponentId, name: 'Team not found' };
        }));
        const opponent = opponents.find(opponent => opponent.id.toString() !== teamId.toString());
        return {
            ...game._doc,
            opponent: opponent,
            formattedTime: new Date(game.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
    }));
}

async function getPastGamesForTeam(teamId) {
    const games = await Game.find({ "opponents": teamId, "status": "Ended" }).exec();
    return Promise.all(games.map(async game => {
        const opponents = await Promise.all(game.opponents.map(async opponentId => {
            const team = await Team.findById(opponentId).exec();
            return team ? { id: team._id, name: team.name } : { id: opponentId, name: 'Team not found' };
        }));
        const opponent = opponents.find(opponent => opponent.id.toString() !== teamId.toString());
        const winner = game.goals[0] > game.goals[1] ? opponents[0] : (game.goals[0] < game.goals[1] ? opponents[1] : { name: 'Unentschieden' });
        return {
            ...game._doc,
            opponent: opponent,
            winner: winner,
            formattedTime: new Date(game.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
    }));
}

async function getGoalsForTeam(teamId) {
    const games = await Game.find({ "goalsLog.teamIndex": { $exists: true } }).exec();
    const goals = [];
    let teamGoalIndex = 0;
    for (const game of games) {        
        for (const goal of game.goalsLog) {
            const teamIndex = goal.teamIndex;
            const teamIdFromGame = game.opponents[teamIndex].toString();
            if (teamIdFromGame === teamId.toString()) {
                teamGoalIndex++;
                const player = goal.player ? await Player.findById(goal.player).exec() : null;
                const opponents = await Promise.all(game.opponents.map(async opponentId => {
                    const team = await Team.findById(opponentId).exec();
                    return team ? { id: team._id, name: team.name } : { id: opponentId, name: 'Team not found' };
                }));
                const opponent = opponents.find(opponent => opponent.id.toString() !== teamId.toString());
                goals.push({
                    ...goal._doc,
                    gameDisplayName: game.gameDisplayName,
                    gameIndex: game.number,
                    opponent: opponent,
                    formattedTimestamp: new Date(goal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    formatedgameTimestamp: new Date(goal.gameTimestamp * 1000).toISOString().slice(14, 19),
                    playerName: player ? player.name : 'Unbekannt',
                    teamGoalIndex: teamGoalIndex,
                });
            }
        }
    }
    // Sort goals by timestamp in descending order
    goals.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return goals;
}

async function updateRanks(teamsByGroup) {
    for (const group of teamsByGroup) {
        for (const team of group.teams) {
            team.rank = await getRank(team);
        }

        // Sort teams within the group based on rank
        group.teams.sort((a, b) => a.rank - b.rank);
    }
}

module.exports = {
    TeamController: router,
    getTeamsByGroup
};