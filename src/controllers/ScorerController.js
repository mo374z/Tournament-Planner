const express = require('express');
const mongoose = require('mongoose');
const Game = mongoose.model('Game');
const Player = mongoose.model('Player');
const Team = mongoose.model('Team');
const router = express.Router();


//Code part to enable the authentication for all the following routes
const  {verifyToken, checkLoginStatus , isAdmin} =  require('../middleware/auth'); // Pfad zur auth.js-Datei
const cookieParser = require('cookie-parser'); 
const e = require('express');
const { times } = require('lodash');
router.use(cookieParser());                 // Add cookie-parser middleware to parse cookies

router.use(verifyToken);                    // Alle nachfolgenden Routen sind nur für angemeldete Benutzer zugänglich
router.use((req, res, next) => {            // Middleware, um Benutzerinformationen an res.locals anzuhängen
    res.locals.username = req.username;
    res.locals.userrole = req.userRole;
    next();
  });
//--------------------------------------------------------------



router.get('/', async (req, res) => {
    try {
        const games = await Game.find({ status: { $in: ['active', 'Ended'] } }).exec(); // Fetch all active and ended games
        const players = await Player.find().exec();
        const teams = await Team.find().exec(); // Fetch all teams
        
        const goalsWithoutPlayer = [];
        const goalsWithPlayer = [];


        for (const game of games) {
            const opponents = await Promise.all(game.opponents.map(async opponentId => {
                const team = await Team.findById(opponentId).exec();
                return team ? team.name : 'Team not found';
            }));


            game.goalsLog.forEach((goal, index) => {
                const goalData = {
                    ...goal._doc,
                    gameId: game._id,
                    gameDisplayName: game.gameDisplayName,
                    gameNumber: game.number,
                    opponents,
                    sekt: goal.sekt_won ? 'Ja' : 'Nein',
                    teamName: opponents[goal.teamIndex],
                    formattedTimestamp: new Date(goal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' , second: '2-digit'}),
                    gameTimestamp: goal.gameTimestamp, //timer in seconds
                    formatedgameTimestamp: new Date(goal.gameTimestamp * 1000).toISOString().slice(14, 19), // Format to mm:ss
                    scores: goal.newScore,
                    teamIndex: goal.teamIndex,
                    timestamp: goal.timestamp,
                    goalIndexTournament: goal.goalIndexTournament,
                    goalId: goal._id
                };

                if (goal.player) {
                    const player = players.find(p => p._id.equals(goal.player));
                    goalData.playerName = player ? player.name : 'Unbekannt';
                    goalsWithPlayer.push(goalData);
                } else {
                    goalsWithoutPlayer.push(goalData);
                }
            });
        }

        // Sort the goals by timestamp in descending order
        goalsWithoutPlayer.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        goalsWithPlayer.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));


        // // Debugging logs
        // console.log('Goals without player (sorted):', goalsWithoutPlayer.map(goal => goal.timestamp));
        // console.log('Goals with player (sorted):', goalsWithPlayer.map(goal => goal.timestamp));

        res.render('layouts/scorer', { goalsWithoutPlayer, goalsWithPlayer, players, teams });
    } catch (err) {
        console.error('Error fetching goals: ', err);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/assignPlayer', async (req, res) => {
    try {
        const { gameId, goalId, playerId } = req.body;
        const game = await Game.findById(gameId).exec();
        const goal = game.goalsLog.id(goalId);

        //Save Data in Game: goalsLog: player
        goal.player = playerId; // Assign the player to the goal in the game
        //Save Data in Player: goals, total_goals
        const player = await Player.findById(playerId).exec();
        // Update the player's total goals
        player.total_goals += 1;
        // Add the goal to the player's goals array with the gameId and goalId
        player.goals.push({ gameId, goalId }); // Add the goal to the player's goals array
        //save the player
        await player.save();
        //save the game
        await game.save();
        console.log("Spieler " + player.name + " hat jetzt " + player.total_goals + " Tore");

        res.redirect('/scorer');
    } catch (err) {
        console.error('Error assigning player to goal: ', err);
        res.status(500).send('Internal Server Error');
    }
});


async function removeAllPlayerfromAllGameGoals() {
    try {
        const games = await Game.find().exec();
        for (const game of games) {
            for (const goal of game.goalsLog) {
                if (goal.player) {
                    goal.player = null;
                }
            }
            await game.save();
        }
    } catch (err) {
        console.error('Error removing player from all goals: ', err);
        throw err;
    }
}


//funtion to remove a goal from the database
function removeLastGoalfromGameAndPlayer(game, opponentIndex) {
    return new Promise(async (resolve, reject) => {
        try {
            // Get the goals of the game
            const goals = game.goalsLog;
            
            // Check if there are goals in the game
            if(goals.length === 0){
                console.log("No goals in the game");
                resolve();
            } else {

                // Get the goals of the team in the game
                const goalsfromTeam = goals.filter(goal => goal.teamIndex === opponentIndex);
                //sort the goals by timestamp in descending order (newest goal on top)
                goalsfromTeam.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                //take the newest goal (the goal on top)
                const lastGoal = goalsfromTeam.slice(0, 1);


                // Check if there are goals
                if(lastGoal.length === 0){
                    console.log("No goals of the team in the game");
                    resolve();
                } else {
                    
                    if (lastGoal[0].player) {                           // Check if a player was assigned to the goal
                        await removeGoalFromPlayer(lastGoal[0], game, opponentIndex);
                    } else {
                        console.log("No player was assigned to the goal");
                    }

                    //Update Goal indexes if necessary
                    //Check if there are goals from the other team in the game wich are newer than the removed goal
                    const goalsfromOtherTeam = goals.filter(goal => goal.teamIndex !== opponentIndex && goal.timestamp > lastGoal[0].timestamp);
                    //update the goalIndex and the goalIndexTournament of the newer goals because the goalIndex of the removed goal between the goals is now missing
                    for (const goal of goalsfromOtherTeam) {
                        if(goal.goalIndex > lastGoal[0].goalIndex){
                            goal.goalIndex -= 1;
                        }
                        if(goal.goalIndexTournament > lastGoal[0].goalIndex){
                            goal.goalIndexTournament -= 1;
                        }
                    }

                    // Remove the goal from the game
                    game.goalsLog = game.goalsLog.filter(goal => goal._id.toString() !== lastGoal[0]._id.toString()); // Filter out the goal with the goalId
                }
                //  ! game is saved in the game controller !

                resolve(); // Resolve the promise if everything was successful
            }            
        } catch (err) {
            console.error('Error removing goal: ', err);
            reject(err);
        }
    });
}



async function removeGoalFromPlayer(goal, game, opponentIndex) {
    const player = await Player.findById(goal.player).exec();
    // Check if the player has goals
    if (player.total_goals === 0) {
        console.log("Player has no goals");
        return;
    }
    // Check if the player has the goal in his goals array
    const goalIndex = player.goals.findIndex(g => g.gameId.toString() === game._id.toString() && g.goalId.toString() === goal._id.toString());
    if (goalIndex === -1) {
        console.log("Player has this goal not in his goals array");
        return;
    }
    console.log("Removing goal index " + goal.goalIndex + " from player " + player.name);
    // Remove the goal from the player with the gameId and goalId
    player.goals = player.goals.filter(g => g.gameId.toString() !== game._id.toString() || g.goalId.toString() !== goal._id.toString());
    // Remove the goal from the player if it's not at 0 already
    if (player.total_goals > 0) {
        player.total_goals -= 1;
    }
    // Save the player
    await player.save();

    if (goal.player) {
        console.log("Goal nr. " + goal.goalIndex + " from team " + game.opponents[opponentIndex] + " at " + goal.gameTimestamp + " was removed from Game and Player. Player " + player.name + " was assigned to the goal");
    } else {
        console.log("Goal nr. " + goal.goalIndex + " from team " + game.opponents[opponentIndex] + " at " + goal.gameTimestamp + " was removed. No player was assigned to the goal");
    }
}

module.exports = {
    router,
    removeLastGoalfromGameAndPlayer,
    removeAllPlayerfromAllGameGoals
};