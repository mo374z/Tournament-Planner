

const express = require('express');
var router = express.Router();

const mongoose = require('mongoose');
const Game = mongoose.model('Game');
const Team = mongoose.model('Team');

const MainSettings = mongoose.model('MainSettings');


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


router.get('/list', async (req, res) => {
    renderScheduleList(req, res);
});

router.get('/generate', isAdmin, async (req, res) => {

    // Call the function to generate and save the group stage schedule

    const mainSettings = await MainSettings.findOne(); // Fetch Main Settings

    const startTime = mainSettings.TornamentStartTime;
    const gameDurationGroupStage = mainSettings.gameDurationGroupStage / (1000 * 60); // Convert milliseconds to minutes
    const gameDurationQuarterfinals = mainSettings.gameDurationQuarterfinals / (1000 * 60); // Convert milliseconds to minutes
    const timeBetweenGames = mainSettings.timeBetweenGames / (1000 * 60); // Convert milliseconds to minutes
    const timeBetweenGamePhases = mainSettings.timeBetweenGamePhases / (1000 * 60); // Convert milliseconds to minutes

    const initialStatus = 'Scheduled'; // Replace with your desired initial status

    console.log("Gernerating Group stage schedule...");
    const lastGroupStageGameEndTime = await generateGroupStageSchedule(startTime, gameDurationGroupStage, timeBetweenGames, initialStatus, "Group_Stage");
    console.log("Last Group stage game end time: " + lastGroupStageGameEndTime);

    const StartTimeQuarterfinals = lastGroupStageGameEndTime; // Set the start time for the Quarterfinals
    console.log("Quarterfinals start time: " + StartTimeQuarterfinals);
    StartTimeQuarterfinals.setMinutes( StartTimeQuarterfinals.getMinutes() + timeBetweenGamePhases); //Add the time between game phases to the last group stage game end time
    console.log("Quarterfinals start time NEW: " + StartTimeQuarterfinals);

    console.log("Gernerating Quarterfinals schedule..." + gameDurationQuarterfinals);
    // Call the function to generate and save the Quarterfinals schedule
    generateQuarterFinalsSchedule(StartTimeQuarterfinals, gameDurationQuarterfinals, timeBetweenGames, initialStatus, "Quarterfinals");


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
        if (teamId.toString().includes("von")) {
            return { name: teamId, group: '-' };
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

        gameNumber = 1;

        for (const group in groupedTeams) {
            const teamsInGroup = groupedTeams[group];

            for (let i = 0; i < teamsInGroup.length; i++) {
                for (let j = i + 1; j < teamsInGroup.length; j++) {
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
                        opponents: [teamsInGroup[i]._id, teamsInGroup[j]._id],
                        goals: [0, 0], // Setting initial goals as [0, 0]
                        gamePhase: gamePhase
                    });

                    await newGame.save();

                    lastGameEndTime = new Date(newGame.time.getTime() + newGame.duration * 60000);
                    gameNumber++;
                }
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


async function generateQuarterFinalsSchedule(scheduleStartTime, gameDuration, timeBetweenGames, initialStatus, gamePhase) {

    try {
        //generate Quarterfinals schedule: 1A vs 2B, 1B vs 2A, 1C vs 2D, 1D vs 2C
        //use team Data to get the 2 teams with the highest points from each group
        //sort the team Data by points
        //use the first 2 teams from each group

        const teams = await Team.find({});
        const groupedTeams = {};

        //group all the teams by group
        teams.forEach(team => {
            if (!groupedTeams[team.group]) {
                groupedTeams[team.group] = [];
            }
            groupedTeams[team.group].push(team);
        });

        //sort the teams in each group by points
        for (const group in groupedTeams) {
            groupedTeams[group].sort((a, b) => b.points - a.points);
        }


        //get the first 2 teams from each group wich have the highest points and more than 0 games played
        const teamsInQuarterFinals = [];
        for (const group in groupedTeams) {
            if (groupedTeams[group].length >= 2 && groupedTeams[group][0].gamesPlayed > 0) {
                teamsInQuarterFinals.push(groupedTeams[group][0]);
                teamsInQuarterFinals.push(groupedTeams[group][1]);
                //console.log("Group: " + group + " Team 1: " + groupedTeams[group][0].name + " Team 2: " + groupedTeams[group][1].name);
            } else if (groupedTeams[group].length === 1 && groupedTeams[group][0].gamesPlayed > 0) {
                teamsInQuarterFinals.push(groupedTeams[group][0]);
                teamsInQuarterFinals.push(`1. von Gruppe ${group}`);
                //console.log("Group: " + group + " Team 1: " + groupedTeams[group][0].name + " Team 2: 1. von Gruppe " + group);
            } else {
                teamsInQuarterFinals.push(`1. von Gruppe ${group}`);
                teamsInQuarterFinals.push(`2. von Gruppe ${group}`);
                //console.log("Group: " + group + " Team 1: 1. von Gruppe " + group + " Team 2: 2. von Gruppe " + group);
            }
        }

        console.log("Teams in Quarterfinals: " + teamsInQuarterFinals);

        const FirstgameNumber = gameNumber;
        
        //gameNumber = 1; gameNumber is already set from the group stage schedule
        //generate the games
        for (let i = 0; i < teamsInQuarterFinals.length; i++) {
            for (let j = i + 1; j < teamsInQuarterFinals.length; j++) {
                const gameStartTime = new Date(scheduleStartTime);
                if (gameNumber > FirstgameNumber) {
                    gameStartTime.setMinutes(
                        gameStartTime.getMinutes() + (gameNumber - FirstgameNumber) * (gameDuration + timeBetweenGames)
                    );
                }

                const newGame = new Game({
                    number: gameNumber,
                    time: gameStartTime,
                    duration: gameDuration,
                    status: initialStatus,
                    opponents: [teamsInQuarterFinals[i], teamsInQuarterFinals[j]],
                    goals: [0, 0], // Setting initial goals as [0, 0]
                    gamePhase: gamePhase
                });


                await newGame.save();
                gameNumber++;
            }
        }

    } catch (err) {
        console.error('Error generating Quaterfinals schedule: ', err);
    }

}



async function updateQuarterFinalsSchedule() {

    try {
        //seach for the games in the game schedule with gamePhase Quarterfinals and update them with the new teams when team data is updated
        
        const teams = await Team.find({});
        const groupedTeams = {};

        //group all the teams by group
        teams.forEach(team => {
            if (!groupedTeams[team.group]) {
                groupedTeams[team.group] = [];
            }
            groupedTeams[team.group].push(team);
        });

        //sort the teams in each group by points
        for (const group in groupedTeams) {
            groupedTeams[group].sort((a, b) => b.points - a.points);
        }

        //print the grouped teams
        for (const group in groupedTeams) {
            console.log("Group: " + group);
            for (const team of groupedTeams[group]) {
                console.log("Team: " + team.name + " Points: " + team.points + " Games Played: " + team.gamesPlayed);
            }
        }

        console.log("Updating Quarterfinals schedule...");


        const games = await Game.find({gamePhase: "Quarterfinals"});

        //get the first 2 teams from each group wich have the highest points and more than 0 games played
        for (const group in groupedTeams) {
            if (groupedTeams[group][0].gamesPlayed > 0 || groupedTeams[group][1].gamesPlayed > 0) { //check if the first 2 teams in the group have played at least 1 game

                //search for the game with the Placeholders from the group and update the game with the new teams
                for (const game of games) {

                    if (game.opponents[0] === `1. von Gruppe ${group}`) {   //check if first opponent is a placeholder 1. von Gruppe
                        console.log("Updating Placeholder 1. von Gruppe " + group + " with " + groupedTeams[group][0].name + " in game " + game.number);
                        await Game.findByIdAndUpdate(game._id, {
                            opponents: [groupedTeams[group][0]._id, game.opponents[1]]
                        });
                    }
                    else if (game.opponents[0] === `2. von Gruppe ${group}`) { //check if first opponent is a placeholder 2. von Gruppe
                        console.log("Updating Placeholder 2. von Gruppe " + group + " with " + groupedTeams[group][1].name + " in game " + game.number);
                        await Game.findByIdAndUpdate(game._id, {
                            opponents: [groupedTeams[group][1]._id, game.opponents[1]]
                        });
                    }
                    if (game.opponents[1] === `1. von Gruppe ${group}`) {      //check if second opponent is a placeholder 1. von Gruppe                   
                        console.log("Updating Placeholder 1. von Gruppe " + group + " with " + groupedTeams[group][0].name + " in game " + game.number);
                        await Game.findByIdAndUpdate(game._id, {
                            opponents: [game.opponents[0], groupedTeams[group][0]._id]
                        });
                    }
                    else if (game.opponents[1] === `2. von Gruppe ${group}`) {      //check if second opponent is a placeholder 2. von Gruppe
                        console.log("Updating Placeholder 2. von Gruppe " + group + " with " + groupedTeams[group][1].name + " in game " + game.number);
                        await Game.findByIdAndUpdate(game._id, {
                            opponents: [game.opponents[0], groupedTeams[group][1]._id]
                        });
                    }

                    else {
                        console.log("No more Placeholder updated for group " + group +" in game " + game.number);
                    }
                }

            }
            else {
                console.log("Keine eindeutigen Daten in Gruppe " + group);
            }
        }


    } catch (err) {
        console.error('Error updating Quaterfinals schedule: ', err);
    }

}












    // const mongoose = require('mongoose');

    // var TeamSchema = new mongoose.Schema({
    //     name:{
    //         type: String,
    //         required: 'This field is required'
    //     },
    //     group: {
    //         type: String,
    //         required: 'This field is required'
    //     },
    //     gamesPlayed: {
    //         type: Number,
    //     },
    //     gamesWon: {
    //         type: Number,
    //     },
    //     gamesLost: {
    //         type: Number,
    //     },
    //     gamesDraw: {
    //         type: Number,
    //     },
    //     goals: { // Tore (geschossene Tore [0] - erhaltene Tore[1])
    //         type: Array,
    //     },
    //     sektWon: {
    //         type: Number,    //nicht relevant für Plazierung
    //     },
    //     points: {
    //         type: Number,
    //     },
    
    // });


async function clearGamesCollection() {
    try {
        await Game.deleteMany({}); // This clears the 'Games' collection
        console.log('Games collection cleared successfully!');
    } catch (err) {
        console.error('Error clearing Games collection: ', err);
    }
}





module.exports = router;