

// // write a function, that given all the teams generates a schedule of games for the group phase
// function generateGroupSchedule(teams) {
//     // TODO
// }

// // generate a schedule for the k.o. phase given the results of the group phase
// function generateKOSchedule(groupResults) {
//     // TODO
// }


const express = require('express');
var router = express.Router();

const mongoose = require('mongoose');
const Game = mongoose.model('Game');
const Team = mongoose.model('Team');



// router.get('/list', async (req, res) => {
//     try {
//         const Games = await Game.find({});
//         res.render('layouts/schedulelist', {
//             list: Games
//         });


//     } catch (err) {
//         console.log('Error in retrieval: ' + err);
//     }
// });


router.get('/list', async (req, res) => {
    renderScheduleList(req, res);
});


function renderScheduleList(req, res) {
    fetchGamesData()
        .then(games => {
            res.render('layouts/schedulelist', {
                list: games
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

        for (const game of games) {
            const opponents = game.opponents;
            const opponentData = await Promise.all(opponents.map(async id => await getTeamDataById(id)));
            const opponentsInfo = opponentData.map(opponent => `${opponent.name}`).join(' vs ');
            game.opponents = opponentsInfo;

            const groupData = opponentData.map(opponent => `${opponent.group}`).join(' vs ');
            game.group = groupData;
        }

        return games;
    } catch (err) {
        console.log('Error in data retrieval: ' + err);
        throw err;
    }
}



router.get('/grouplist', async (req, res) => {
    try {
        const teamsByGroup = await Team.aggregate([
            { $group: { _id: "$group", teams: { $push: "$$ROOT" } } },
        ]);

        // Sort the teamsByGroup array by group name in alphabetical order
        teamsByGroup.sort((a, b) => a._id.localeCompare(b._id));

        res.render('layouts/grouplist', {
            teamsByGroup: teamsByGroup
        });
    } catch (err) {
        console.log('Error in retrieving grouped teams: ' + err);
        // Handle the error appropriately, maybe by rendering an error page
        res.status(500).send('Internal Server Error');
    }
});




async function getTeamDataById(teamId) {
    try {
        const team = await Team.findById(teamId);
        return team ? { name: team.name, group: team.group } : { name: 'Team not found', group: 'Group not found' };
    } catch (err) {
        console.error('Error fetching team data: ', err);
        return { name: 'Error fetching team name', group: 'Error fetching group name' };
    }
}




router.get('/generate', async (req, res) => {

    // Call the function to generate and save the group stage schedule


    // Example usage: specify the start time, game duration in minutes, time between games in minutes, and initial status
    const startTime = new Date('2024-01-01T08:00:00'); // Replace with your desired start time
    const gameDuration = 5; // Replace with your desired game duration in minutes
    const timeBetweenGames = 2; // Replace with your desired time between games in minutes
    const initialStatus = 'Scheduled'; // Replace with your desired initial status

    generateGroupStageSchedule(startTime, gameDuration, timeBetweenGames, initialStatus);


    // Delay the redirect by 1 seconds to allow time for the schedule generation
    setTimeout(() => {
        res.redirect('/schedule/list');
    }, 1000); // 1000 milliseconds (1 seconds) delay

});







async function generateGroupStageSchedule(scheduleStartTime, gameDuration, timeBetweenGames, initialStatus) {


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

        let gameNumber = 1;

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
                        goals: [0, 0] // Setting initial goals as [0, 0]
                    });

                    await newGame.save();
                    gameNumber++;
                }
            }
        }

        console.log('Group stage schedule generated and saved successfully!');
    } catch (err) {
        console.error('Error generating schedule: ', err);
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





module.exports = router;