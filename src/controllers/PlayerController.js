const express = require('express');
const mongoose = require('mongoose');
const { format } = require('path');
const Player = mongoose.model('Player');
const Team = mongoose.model('Team');
const Game = mongoose.model('Game');
const router = express.Router();



//Code part to enable the authentication for all the following routes
const  {verifyToken, checkLoginStatus , isAdmin} =  require('../middleware/auth'); // Pfad zur auth.js-Datei
const cookieParser = require('cookie-parser'); 
const e = require('express');
router.use(cookieParser());                 // Add cookie-parser middleware to parse cookies

router.use(verifyToken);                    // Alle nachfolgenden Routen sind nur für angemeldete Benutzer zugänglich
router.use((req, res, next) => {            // Middleware, um Benutzerinformationen an res.locals anzuhängen
    res.locals.username = req.username;
    res.locals.userrole = req.userRole;
    next();
  });
//--------------------------------------------------------------





// Route to display the player management page
router.get('/', async (req, res) => {
    try {
        const teams = await Team.find().exec();
        const players = await Player.find().exec();

        // Sort players by total_goals in descending order and assign ranks if total goal are 0 then rank will be 0
        players.sort((a, b) => b.total_goals - a.total_goals);
        players.forEach((player, index) => {
            if (player.total_goals === 0) {
                player.rank = "-";
            } else {
                player.rank = index + 1;
            }
        });

        // Filter teams to only include those with players
        const teamsWithPlayers = teams.filter(team => players.some(player => player.team === team._id.toString()));

        res.render('layouts/playerManagement', { teams, teamsWithPlayers, players });
    } catch (err) {
        console.error('Error fetching teams or players: ', err);
        res.status(500).send('Internal Server Error');
    }
});

// Route to add a new player
router.post('/add', async (req, res) => {
    try {
        const { name, number, team } = req.body;
        const newPlayer = new Player({ name, number, team, total_goals: 0, goals: [] });
        await newPlayer.save();
        res.redirect('/player');
    } catch (err) {
        console.error('Error adding player: ', err);
        res.status(500).send('Internal Server Error');
    }
});

// Route to edit an existing player
router.post('/edit/:id', async (req, res) => {
    try {
        const { name, number, team, total_goals } = req.body;
        await Player.findByIdAndUpdate(req.params.id, { name, number, team, total_goals }).exec();
        res.redirect('/player');
    } catch (err) {
        console.error('Error editing player: ', err);
        res.status(500).send('Internal Server Error');
    }
});

// Route to reset all total goals
router.post('/reset-total-goals', async (req, res) => {
    try {
        await Player.updateMany({}, { total_goals: 0 }).exec(); // Reset total goals for all players
        //Remove goals from all players
        await Player.updateMany({}, { $set: { goals: [] } }).exec();

        res.status(200).send('Total goals reset successfully');
    } catch (err) {
        console.error('Error resetting total goals: ', err);
        res.status(500).send('Internal Server Error');
    }
});

// Route to display player details
router.get('/:id', async (req, res) => {
    try {
        const player = await Player.findById(req.params.id).exec();
        const team = await Team.findById(player.team).exec();
        const goals = await Promise.all(player.goals.map(async (goal, index) => { // Fetch goal details for each goal
            const game = await Game.findById(goal.gameId).exec(); // Fetch game details
            if (!game) {
                console.error('Game not found for goal');
                res.status(500).send('No game found for goal');
                return null;
            }
            if(game.goalsLog.length === 0){
                console.log("No goals in the game");
                res.status(500).send('No goals in the game');
                return null;
            }
            const goalDetails = game.goalsLog.id(goal.goalId); // Fetch goal details from the game goalsLog
            if (!goalDetails) {
                console.error('Goal not found in game goalsLog');
                return null;
            }
            else {
                return {
                    ...goalDetails._doc,
                    gameDisplayName: game.gameDisplayName,
                    formattedTimestamp: new Date(goalDetails.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    formatedgameTimestamp: new Date(goalDetails.gameTimestamp * 1000).toISOString().slice(14, 19), // Format to mm:ss
                    formattedGameStartTime: new Date(game.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    gameIndex: game.number,
                    Playerteamindex: goalDetails.teamIndex,
                    sekt_won: goalDetails.sekt_won, // Add sekt_won to goal details
                    opponents: await Promise.all(game.opponents.map(async opponentId => { // Fetch opponent team names
                        const team = await Team.findById(opponentId).exec();
                        return team ? team.name : 'Team not found';
                    }))
                };
            }
        }));

        let numberSekts = 0;

        if(goals.includes(null)) {
            console.error('Error fetching goal details');
            res.status(500).send('Internal Server Error');
            return;
        }
        else {
            // Sort goals by timestamp in descending order
            goals.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            // Calculate number of sekt_won goals by the player
            numberSekts = goals.filter(goal => goal.sekt_won && goal.player.toString() === player._id.toString()).length;
        }

        res.render('layouts/playerDetails', { player, team, goals, numberSekts });
    } catch (err) {
        console.error('Error fetching player details: ', err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;