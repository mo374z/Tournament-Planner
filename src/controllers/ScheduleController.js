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
const { get, find } = require('lodash');

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

    const lastGroupStageGameEndTime = await generateGroupStageSchedule(startTime, gameDurationGroupStage, timeBetweenGames, initialStatus, "Group_Stage", "Gruppenspiel");


    const StartTimeQuarterfinals = lastGroupStageGameEndTime; // Set the start time for the Quarterfinals
    StartTimeQuarterfinals.setMinutes( StartTimeQuarterfinals.getMinutes() + timeBetweenGamePhases); //Add the time between game phases to the last group stage game end time
    console.log("Quarterfinals start time NEW: " + StartTimeQuarterfinals);


    console.log("Gernerating Quarterfinals schedule..." + gameDurationQuarterfinals);
    // Call the function to generate and save the Quarterfinals schedule
    const {lastQuarterFinalsGameEndTime, returnGameNumber1} = await generateQuarterFinalsSchedule(StartTimeQuarterfinals, gameDurationQuarterfinals, timeBetweenGames, initialStatus, gameNumber, "Quarterfinals", "Viertelfinale");
    gameNumber = returnGameNumber1;

    const StartTimeSemifinals = lastQuarterFinalsGameEndTime; // Set the start time for the Semifinals
    StartTimeSemifinals.setMinutes( StartTimeSemifinals.getMinutes() + timeBetweenGamePhases);
    const {lastSemiFinalsGameEndTime, returnGameNumber2} = await generateSemiFinalsSchedule(StartTimeSemifinals, gameDurationSemifinals, timeBetweenGames, initialStatus, gameNumber , "Semifinals", "Halbfinale");
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



// render the page to edit the game
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

// if some game stats are changed afterwards this functions updates team properties in order to keep the ranking correct
function calculateChanges(oldPoints, newPoints, oldGoals, newGoals) {
    const pointChange = [newPoints[0] - oldPoints[0], newPoints[1] - oldPoints[1]];
    const goalChange = [newGoals[0] - oldGoals[0], newGoals[1] - oldGoals[1]];
    
    let gamesWonChange1 = 0, gamesLostChange1 = 0, gamesDrawChange1 = 0;
    let gamesWonChange2 = 0, gamesLostChange2 = 0, gamesDrawChange2 = 0;

    if (oldPoints[0] === 3 && oldPoints[1] === 0 && newPoints[0] === 0 && newPoints[1] === 3) {
        gamesWonChange1 = -1;
        gamesWonChange2 = 1;
        gamesLostChange1 = 1;
        gamesLostChange2 = -1;
    } else if (oldPoints[0] === 3 && oldPoints[1] === 0 && newPoints[0] === 1 && newPoints[1] === 1) {
        gamesWonChange1 = -1;
        gamesLostChange2 = -1;
        gamesDrawChange1 = 1;
        gamesDrawChange2 = 1;
    } else if (oldPoints[0] === 0 && oldPoints[1] === 3 && newPoints[0] === 3 && newPoints[1] === 0) {
        gamesWonChange1 = 1;
        gamesWonChange2 = -1;
        gamesLostChange1 = -1;
        gamesLostChange2 = 1;
    } else if (oldPoints[0] === 0 && oldPoints[1] === 3 && newPoints[0] === 1 && newPoints[1] === 1) {
        gamesLostChange1 = -1;
        gamesWonChange2 = -1;
        gamesDrawChang1 = 1;
        gamesDrawChange2 = 1;
    } else if (oldPoints[0] === 1 && oldPoints[1] === 1 && newPoints[0] === 0 && newPoints[1] === 3) {
        gamesDrawChange1 = -1;
        gamesDrawChange2 = -1;
        gamesLostChange1 = 1;
        gamesWonChange2 = 1;
    } else if (oldPoints[0] === 1 && oldPoints[1] === 1 && newPoints[0] === 3 && newPoints[1] === 0) {
        gamesDrawChange1 = -1;
        gamesDrawChange2 = -1;
        gamesWonChange1 = 1;
        gamesLostChange2 = 1;
    }

    return {
        pointChange,
        goalChange,
        gamesWonChange1,
        gamesLostChange1,
        gamesDrawChange1,
        gamesWonChange2,
        gamesLostChange2,
        gamesDrawChange2
    };
}

async function editTeamInformation(oldGame, newGame) {
    if (getPoints(oldGame) !== getPoints(newGame)) {
        const changes = calculateChanges(getPoints(oldGame), getPoints(newGame), oldGame.goals, newGame.goals);

        opponent1PointChange = changes.pointChange[0];
        opponent2PointChange = changes.pointChange[1];
        opponent1GoalChange = changes.goalChange[0];
        opponent2GoalChange = changes.goalChange[1];
        opponent1GamesWonChange = changes.gamesWonChange1;
        opponent2GamesWonChange = changes.gamesWonChange2;
        opponent1GamesLostChange = changes.gamesLostChange1;
        opponent2GamesLostChange = changes.gamesLostChange2;
        opponent1GamesDrawChange = changes.gamesDrawChange1;
        opponent2GamesDrawChange = changes.gamesDrawChange2;

        if (oldGame.gamePhase === 'Group_Stage') {
            opponent1PointGroupStageChange = opponent1PointChange;
            opponent2PointGroupStageChange = opponent2PointChange;
        }

        // Update team information
        Team.findByIdAndUpdate(oldGame.opponents[0], {
            $inc: {
                gamesWon: opponent1GamesWonChange,
                gamesLost: opponent1GamesLostChange,
                gamesDraw: opponent1GamesDrawChange,
                points_Group_Stage: opponent1PointGroupStageChange,
                points_General: opponent1PointChange
            },
            $set: {
                goals: [opponent1GoalChange + oldGame.goals[0], opponent2GoalChange + oldGame.goals[1]]
            }
        }).exec();

        Team.findByIdAndUpdate(oldGame.opponents[1], {
            $inc: {
                gamesWon: opponent2GamesWonChange,
                gamesLost: opponent2GamesLostChange,
                gamesDraw: opponent2GamesDrawChange,
                points_Group_Stage: opponent2PointGroupStageChange,
                points_General: opponent2PointChange
            },
            $set: {
                goals: [opponent2GoalChange + oldGame.goals[1], opponent1GoalChange + oldGame.goals[0]]
            }
        }).exec();
    }

}

function getPoints(game) {
    goals = [game.goals[0], game.goals[1]];

    if(goals[0] > goals[1]) {
        return [3, 0];
    } else if (goals[0] < goals[1]) {
        return [0, 3];
    } else {
        return [1, 1];
    }
}

router.post('/:id/edit', isAdmin, async (req, res) => { //implement dislayName saving !
    try {
        const gameId = req.params.id;
        let {
            time,
            duration,
            team1,
            team2,
            goals1,
            goals2,
            gameDisplayName
        } = req.body;

        
        // check wether goals are undefined, if not set goals1 and goals2 to 0
        if (goals1 === undefined) {
            goals1 = 0;
        }
        if (goals2 === undefined) {
            goals2 = 0;
        }

        // Fetch existing game details to obtain the old game time
        const existingGame = await Game.findById(gameId);
        const oldGameTime = existingGame.time;
        const oldGameduration = existingGame.duration;

        if (team1 === undefined) {
            team1 = existingGame.opponents[0];
        }
        if (team2 === undefined) {
            team2 = existingGame.opponents[1];
        }

        await Game.findByIdAndUpdate(gameId, {
            time: new Date(time),
            duration: parseInt(duration),
            opponents: [team1, team2],
            goals: [parseInt(goals1), parseInt(goals2)],
            gameDisplayName: gameDisplayName
        }).exec();

        const updatedGame = await Game.findById(gameId).exec();

        // only change team information if the game is already ended
        if (updatedGame.status === 'Ended') {
            await editTeamInformation(existingGame, updatedGame);
        }

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



async function isGamePlayable(game) {

    if(game.status === 'Ended') {                                                   //check if game is ended
        return false;
    }
    else{                                                                           //check if game is game 1
        if(game.number === 1) {
            return true;
        }
        else {                                                                      //check if game bevor is ended
            const gameBefore = await Game.findOne({ number: game.number - 1 });
            if(gameBefore.status === 'Ended') {
                return true;
            }
            else {
                return false;
            }
        }

    }


    //return !(game.group[0] === '-' || game.group[1] === '-' || game.opponents[0].includes('aus Gruppe') || game.opponents[1].includes('aus Gruppe') || game.status === 'Ended');

  }

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

            game.isGamePlayable = await isGamePlayable(game);
        }

        // Sort games by game number
        games.sort((a, b) => a.number - b.number);
        

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

async function generateGroupStageSchedule(scheduleStartTime, gameDuration, timeBetweenGames, initialStatus, gamePhase, displayName) {
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
                        gamePhase: gamePhase,
                        gameDisplayName: displayName
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