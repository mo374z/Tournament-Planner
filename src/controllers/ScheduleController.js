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

    console.log("Gernerating Group stage schedule...");
    const lastGroupStageGameEndTime = await generateGroupStageSchedule(startTime, gameDurationGroupStage, timeBetweenGames, initialStatus, "Group_Stage");
    console.log("Last Group stage game end time: " + lastGroupStageGameEndTime);


    const StartTimeQuarterfinals = lastGroupStageGameEndTime; // Set the start time for the Quarterfinals
    StartTimeQuarterfinals.setMinutes( StartTimeQuarterfinals.getMinutes() + timeBetweenGamePhases); //Add the time between game phases to the last group stage game end time
    console.log("Quarterfinals start time NEW: " + StartTimeQuarterfinals);


    console.log("Gernerating Quarterfinals schedule..." + gameDurationQuarterfinals);
    // Call the function to generate and save the Quarterfinals schedule
    const {lastQuarterFinalsGameEndTime, returnGameNumber1} = await generateQuarterFinalsSchedule(StartTimeQuarterfinals, gameDurationQuarterfinals, timeBetweenGames, initialStatus, "Quarterfinals", gameNumber);
    gameNumber = returnGameNumber1;
    console.log("Last Quarterfinals game end time: " + lastQuarterFinalsGameEndTime+ " Game Number: " + returnGameNumber1);


    const StartTimeSemifinals = lastQuarterFinalsGameEndTime; // Set the start time for the Semifinals
    StartTimeSemifinals.setMinutes( StartTimeSemifinals.getMinutes() + timeBetweenGamePhases); //Add the time between game phases to the last Quarterfinals game end time4
    console.log("Semifinals start time: " + StartTimeSemifinals);
    

    console.log("Gernerating Semifinals schedule..."); 
    const {lastSemiFinalsGameEndTime, returnGameNumber2} = await generateSemiFinalsSchedule(StartTimeSemifinals, gameDurationSemifinals, timeBetweenGames, initialStatus, "Semifinals", gameNumber);
    console.log("Last Semifinals game end time: " + lastSemiFinalsGameEndTime + " Game Number: " + returnGameNumber2);
    gameNumber = returnGameNumber2;

    // Delay the redirect by 1 seconds to allow time for the schedule generation
    setTimeout(() => {
        res.redirect('/schedule/list');
    }, 1000); // 1000 milliseconds (1 seconds) delay

});


router.get('/grouplist', async (req, res) => {
    try {
        const teamsByGroup = await Team.aggregate([
            { $group: { _id: "$group", teams: { $push: "$$ROOT" } } },
            { $project: { groupName: '$_id', teams: 1, _id: 0 } } // Renames _id to groupName
        ]);

        // Sort the teamsByGroup array by group name in alphabetical order
        teamsByGroup.sort((a, b) => a.groupName.localeCompare(b.groupName));

        res.render('layouts/grouplist', {
            teamsByGroup: teamsByGroup
        });
    } catch (err) {
        console.log('Error in retrieving grouped teams: ' + err);
        // Handle the error appropriately, maybe by rendering an error page
        res.status(500).send('Internal Server Error');
    }
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


router.post('/:id/edit', isAdmin, async (req, res) => {
    try {
        const gameId = req.params.id;
        const {
            time,
            duration,
            status,
            team1,
            team2,
            goals1,
            goals2,
            gamePhase
        } = req.body;

        // Fetch existing game details to obtain the old game time
        const existingGame = await Game.findById(gameId);
        const oldGameTime = existingGame.time;
        const oldGameduration = existingGame.duration;

        const updatedGame = await Game.findByIdAndUpdate(gameId, {
            time: new Date(time),
            duration: parseInt(duration),
            status: status,
            opponents: [team1, team2],
            goals: [parseInt(goals1), parseInt(goals2)],
            gamePhase: gamePhase
        }, {
            new: true
        }).exec();

        console.log("New time" + updatedGame.time);

        if (!updatedGame) {
            res.status(404).send('Game not found');
            return;
        }

        console.log("Updating other games...");
        // Fetch subsequent games based on the updated game's time
        const subsequentGames = await Game.find({
            number: {
                $gt: updatedGame.number
            }
        }).sort('number').exec();

        // Calculate time difference between old game time and new input time
        var gameDurationdifference = 0;
        if(oldGameduration !== updatedGame.duration){
            gameDurationdifference = updatedGame.duration - oldGameduration;      // 6 - 5 = 1 in minutes
            console.log("Game duration difference (min): " + gameDurationdifference);
            gameDurationdifference = gameDurationdifference * 60000; // calculate to min 1 minute = 60000 milliseconds
        }
        const timeDifference = updatedGame.time - oldGameTime;
        console.log("Game Time difference: " + timeDifference/60000 + " min");

        const MainTimeDifference = timeDifference + gameDurationdifference;

        console.log("Game Time and duration difference: " + MainTimeDifference/60000 + " min");



        for (const game of subsequentGames) {
            const newStartTime = new Date(game.time.getTime() + MainTimeDifference);

            await Game.findByIdAndUpdate(game._id, {
                time: newStartTime
            }).exec();
        }

        res.redirect('/schedule/list');
    } catch (err) {
        console.error('Error updating game: ', err);
        res.status(500).send('Internal Server Error');
    }
});











function renderScheduleList(req, res) {
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

        let maxGamesInGroup = 0;
        groups.forEach(group => {
            maxGamesInGroup = Math.max(maxGamesInGroup, group.length);
        });

        for (let i = 0; i < maxGamesInGroup; i++) {
            for (const group of groups) {
                const team1 = group[i % group.length];
                const team2 = group[(i + 1) % group.length];

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

        console.log('Group stage schedule generated and saved successfully!');
        console.log("Last game end time: " + lastGameEndTime);

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