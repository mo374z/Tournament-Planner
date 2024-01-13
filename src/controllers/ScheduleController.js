const express = require('express');
var router = express.Router();

const mongoose = require('mongoose');
const Game = mongoose.model('Game');
const Team = mongoose.model('Team');

const MainSettings = mongoose.model('MainSettings');

module.exports = router;

//Code part to enable the authentication for all the following routes
const  {verifyToken, checkLoginStatus , isAdmin} =  require('../middleware/auth'); // Pfad zur auth.js-Datei
const cookieParser = require('cookie-parser'); 

router.use(cookieParser());                 // Add cookie-parser middleware to parse cookies

router.use(verifyToken);                    // Alle nachfolgenden Routen sind nur für angemeldete Benutzer zugänglich
router.use((req, res, next) => {            // Middleware, um Benutzerinformationen an res.locals anzuhängen
    res.locals.username = req.username;
    res.locals.userrole = req.userRole;
    next();
  });
//--------------------------------------------------------------


router.get('/list', async (req, res) => {
    renderScheduleList(req, res);
});


// Import the functions to generate the Semischedule
const { generateSemiFinalsSchedule, updateSemiFinalsSchedule } = require('./SemiFinalsController');
const { generateQuarterFinalsSchedule, updateQuarterFinalsSchedule } = require('./QuarterFinalsController');

router.get('/generate', isAdmin, async (req, res) => {

    // Call the function to generate and save the group stage schedule

    const mainSettings = await MainSettings.findOne(); // Fetch Main Settings

    const startTime = mainSettings.TornamentStartTime;
    const gameDurationGroupStage = mainSettings.gameDurationGroupStage / (1000 * 60); // Convert milliseconds to minutes
    const gameDurationQuarterfinals = mainSettings.gameDurationQuarterfinals / (1000 * 60); // Convert milliseconds to minutes
    const gameDurationSemifinals = mainSettings.gameDurationSemifinals / (1000 * 60); // Convert milliseconds to minutes
    const timeBetweenGames = mainSettings.timeBetweenGames / (1000 * 60); // Convert milliseconds to minutes
    const timeBetweenGamePhases = mainSettings.timeBetweenGamePhases / (1000 * 60); // Convert milliseconds to minutes

    const initialStatus = 'Scheduled'; // Replace with your desired initial status

    const lastGroupStageGameEndTime = await generateGroupStageSchedule(startTime, gameDurationGroupStage, timeBetweenGames, initialStatus, "Group_Stage");


    const StartTimeQuarterfinals = lastGroupStageGameEndTime; // Set the start time for the Quarterfinals
    StartTimeQuarterfinals.setMinutes( StartTimeQuarterfinals.getMinutes() + timeBetweenGamePhases); //Add the time between game phases to the last group stage game end time
    console.log("Quarterfinals start time NEW: " + StartTimeQuarterfinals);


    console.log("Gernerating Quarterfinals schedule..." + gameDurationQuarterfinals);
    // Call the function to generate and save the Quarterfinals schedule
    const {lastQuarterFinalsGameEndTime, returnGameNumber1} = await generateQuarterFinalsSchedule(StartTimeQuarterfinals, gameDurationQuarterfinals, timeBetweenGames, initialStatus, "Quarterfinals", gameNumber);
    gameNumber = returnGameNumber1;

    const StartTimeSemifinals = lastQuarterFinalsGameEndTime; // Set the start time for the Semifinals
    StartTimeSemifinals.setMinutes( StartTimeSemifinals.getMinutes() + timeBetweenGamePhases);
    const {lastSemiFinalsGameEndTime, returnGameNumber2} = await generateSemiFinalsSchedule(StartTimeSemifinals, gameDurationSemifinals, timeBetweenGames, initialStatus, "Semifinals", gameNumber);
    gameNumber = returnGameNumber2;

    // Delay the redirect by 1 seconds to allow time for the schedule generation
    setTimeout(() => {
        res.redirect('/schedule/list');
    }, 1000); // 1000 milliseconds (1 seconds) delay

});

router.get('/updateQuarterFinals', isAdmin, async (req, res) => {

    // Call the function to update the Quarterfinals schedule
    console.log("Updating Quarterfinals schedule...");
    updateQuarterFinalsSchedule();

    // Delay the redirect by 1 seconds to allow time for the schedule generation
    setTimeout(() => {
        res.redirect('/schedule/list');
    }, 1000); // 1000 milliseconds (1 seconds) delay

});

router.get('/updateSemiFinals', isAdmin, async (req, res) => {

    // Call the function to update the Semifinals schedule
    console.log("Updating Semifinals schedule...");
    updateSemiFinalsSchedule();

    // Delay the redirect by 1 seconds to allow time for the schedule generation
    setTimeout(() => {
        res.redirect('/schedule/list');
    }, 1000); // 1000 milliseconds (1 seconds) delay

});




router.get('/:id', isAdmin, async (req, res) => {
    try {
        const gameId = req.params.id;
        const game = await Game.findById(gameId).exec();
        const teams = await Team.find({});

        res.render('layouts/editGame', {
            game: game,
            teams: teams
        });
    } catch (err) {
        console.error('Error fetching game for edit: ', err);
        // Handle the error appropriately, maybe by rendering an error page
        res.status(500).send('Internal Server Error');
    }
});


const updateSubsequentGamesTime = async (gameId, mainTimeDifference) => {
    try {
        // find number of game by gameId
        const game = await Game.findById(gameId).exec();

        // Fetch subsequent games based on the updated game's time
        const subsequentGames = await Game.find({
            number: {
                $gt: game.number
            }
        }).sort('number').exec();

        for (const game of subsequentGames) {
            // calculate new time for each subsequent game based on the prevoius game's time
            // also take the pauses into account
            const newStartTime = new Date(game.time.getTime() + mainTimeDifference);

            await Game.findByIdAndUpdate(game._id, {
                time: newStartTime
            }).exec();
        }

        console.log("Updated time for subsequent games");
    } catch (err) {
        console.error('Error updating subsequent games time: ', err);
        throw err; // Re-throw the error for handling in the main function
    }
};

function calculateUpdateValues(game, updatedGame) {
    // given the former game and the values, which are updated, determine whether the winner has changed and change the points of the teams


}

router.post('/:id/edit', isAdmin, async (req, res) => {
    try {
        const gameId = req.params.id;
        const {
            time,
            duration,
            team1,
            team2,
            goals1,
            goals2,
        } = req.body;

        // Fetch existing game details to obtain the old game time
        const existingGame = await Game.findById(gameId);
        const oldGameTime = existingGame.time;
        const oldGameduration = existingGame.duration;

        // TODO: only allow for changing teams, when the game is not played yet

        const updatedGame = await Game.findByIdAndUpdate(gameId, {
            time: new Date(time),
            duration: parseInt(duration),
            opponents: [team1, team2],
            goals: [parseInt(goals1), parseInt(goals2)],
        }, {
            new: true
        }).exec();

        if (!updatedGame) {
            res.status(404).send('Game not found');
            return;
        }

        // Calculate time difference between old game time and new input time
        var gameDurationdifference = 0;
        if (oldGameduration !== updatedGame.duration) {
            gameDurationdifference = (updatedGame.duration - oldGameduration) * 60000; // Convert to milliseconds
        }

        const timeDifference = updatedGame.time - oldGameTime;
        const mainTimeDifference = timeDifference + gameDurationdifference;

        await updateSubsequentGamesTime(gameId, mainTimeDifference);

        res.redirect('/schedule/list');
    } catch (err) {
        console.error('Error updating game: ', err);
        res.status(500).send('Internal Server Error');
    }
});


function renderScheduleList(req, res) { //TODO: add isGamePlayable function from helper here
    fetchGamesData()
    .then(({ games, timeBetweenGames }) => {
            res.render('layouts/schedulelist', {
                list: games,
                timeBetweenGames: timeBetweenGames
            });
        })
        .catch(err => {
            console.log('Error rendering schedule list: ' + err);
            // Handle the error appropriately, maybe by rendering an error page
        });
}



// isGamePlayable: function(game) {
//     //check if game on nuber befor this game is played or not
//     //if not return false
//     if (game.number === 1) {
//       return true;
//     } else {
//       const gameBeforeQuery = Game.findOne({ number: game.number - 1 });
//       const gameBefore = gameBeforeQuery.exec();
//       console.log(gameBefore.status);
//       if (gameBefore.status === 'Ended') {
//         return true;
//       } else {
//         return false
//       }
//     }

//     // 
//     // return gameBefore.status === 'Ended';

//     //return !(game.group[0] === '-' || game.group[1] === '-' || game.opponents[0].includes('aus Gruppe') || game.opponents[1].includes('aus Gruppe') || game.status === 'Ended');

//   }

async function fetchGamesData() {
    try {
        const games = await Game.find({});
        const mainSettings = await fetchMainSettings(); // Fetch main settings

        for (const game of games) {
            const opponents = game.opponents;
            const opponentData = await Promise.all(opponents.map(async id => await getTeamDataById(id)));
            const opponentsInfo = opponentData.map(opponent => opponent.name);
            game.opponents = opponentsInfo;

            const groupData = opponentData.map(opponent => opponent.group);
            game.group = groupData;
        }

        return { games, timeBetweenGames: mainSettings.timeBetweenGames/60000 };
    } catch (err) {
        console.log('Error in data retrieval: ' + err);
        throw err;
    }
}

async function fetchMainSettings() {
    try {
        const mainSettings = await MainSettings.findOne({});
        return mainSettings;
    } catch (err) {
        console.log('Error fetching Main Settings: ' + err);
        throw err;
    }
}

async function getTeamDataById(teamId) {
    try {
        if (teamId.isDummy) {
            return { name: teamId.name, group: teamId.group };
        } else {
            const team = await Team.findById(teamId);
            return team ? { name: team.name, group: team.group } : { name: 'Team not found', group: 'Group not found' };
        }
    } catch (err) {
        console.error('Error fetching team data: ', err);
        return { name: 'Error fetching team name', group: 'Error fetching group name' };
    }
}

let gameNumber;

async function generateGroupStageSchedule(scheduleStartTime, gameDuration, timeBetweenGames, initialStatus, gamePhase) {
    let lastGameEndTime = 0; // This will be returned as the last game end time
    gameNumber = 1;
    
    // attention: this algorithm only works for equally sized groups
    try {
        await clearGamesCollection(); // Clear existing games before generating new ones

        const teams = await Team.find({});
        const groupedTeams = {};

        teams.forEach(team => {
            if (!groupedTeams[team.group]) {
                groupedTeams[team.group] = [];
            }
            groupedTeams[team.group].push(team);
        });

        const groups = Object.values(groupedTeams);

        const groupLength = groups[0].length;

        for (let i = 0; i < groupLength; i++) {
            for (let j = i + 1; j < groupLength; j++) {
                for (const group of groups) {
                    const team1 = group[i];
                    const team2 = group[j];

                    const gameStartTime = new Date(scheduleStartTime);
                    if (gameNumber > 1) {
                        gameStartTime.setMinutes(
                            gameStartTime.getMinutes() + (gameNumber - 1) * (gameDuration + timeBetweenGames)
                        );
                    }

                    const newGame = new Game({
                        number: gameNumber,
                        time: gameStartTime,
                        duration: gameDuration,
                        status: initialStatus,
                        opponents: [team1._id, team2._id],
                        goals: [0, 0], // Setting initial goals as [0, 0]
                        gamePhase: gamePhase
                    });

                    await newGame.save();

                    lastGameEndTime = new Date(newGame.time.getTime() + newGame.duration * 60000);
                    gameNumber++;
                }
            }
        }
        return lastGameEndTime;
    } catch (err) {
        console.error('Error generating Group stage schedule: ', err);
        return lastGameEndTime;
    }
}



async function clearGamesCollection() {
    try {
        await Game.deleteMany({}); // This clears the 'Games' collection
        console.log('Games collection cleared successfully!');
    } catch (err) {
        console.error('Error clearing Games collection: ', err);
    }
}