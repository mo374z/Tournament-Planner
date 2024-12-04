const express = require('express');
var router = express.Router();
const mongoose = require('mongoose');
const Game = mongoose.model('Game');
const Team = mongoose.model('Team');
const MainSettings = mongoose.model('MainSettings');
const genCounters = mongoose.model('generalCounters');
const socketIo = require('socket.io');
const app = express();

const {updateSocketConfig} = require('../config/socketConfig');

const socketConfig = updateSocketConfig(process.argv.slice(2));

const socketPort = socketConfig.socketPort;
const useHttps = socketConfig.protocol === 'https';

let server;
if (useHttps) {
    const https = require('https');
    const fs = require('fs');
    server = https.createServer({
        key: fs.readFileSync('./private-key.pem'),
        cert: fs.readFileSync('./certificate.pem'),
    }, app);
} else {
    const http = require('http');
    server = http.createServer(app);
}




const cors = require('cors');

//Code part to enable the authentication for all the following routes
const {verifyToken, checkLoginStatus, isAdmin} = require('../middleware/auth');
const cookieParser = require('cookie-parser');
router.use(cookieParser());
router.use(verifyToken);
router.use((req, res, next) => {
    res.locals.username = req.username;
    res.locals.userrole = req.userRole;
    next();
});

const {updateQuarterFinalsSchedule} = require('./QuarterFinalsController');
const {updateSemiFinalsSchedule} = require('./SemiFinalsController');
const { removeLastGoalfromGameAndPlayer } = require('./ScorerController');

// Start the Websocket server
server.listen(socketPort, () => {
    console.log(`${useHttps ? 'HTTPS' : 'HTTP'} Websocket server running on port ${socketPort}`);
});

// Enable CORS for Socket.IO
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true,
    }
});

app.use(cors());

let timerInterval = null;
let timer = 0;
let isPaused = true;

let infoBannerMessage = ''; // Variable to store the info banner message

// WebSocket logic
io.on('connection', (socket) => {

    socket.on('playPauseGame', () => {
        if (isPaused) {
            isPaused = false;
            io.emit('playSound');
            timerInterval = setInterval(() => {             //Timer resuluion is 1 second !! (timer Variable is in seconds)
                if (timer > 0 && !isPaused) {
                    timer--;
                    io.emit('timerUpdate', timer, isPaused, 'Running');
                } else if (timer === 0) {
                    clearInterval(timerInterval);

                    io.emit('playSound');

                    io.emit('timerUpdate', timer, isPaused, 'Ended');
                }
            }, 1000);
        } else {
            clearInterval(timerInterval);
            isPaused = true;
            io.emit('timerUpdate', timer, isPaused, 'Paused');
        }
});

    socket.on('resetGame', (duration) => {                  //duration is in seconds
        resetTimer(duration);
    });


    socket.on('addPlaybackTime', (minutesToAdd) => {
        if(timer + minutesToAdd*60 > 0){            
            timer = timer + minutesToAdd*60;  
            if(!isPaused && timer > 0) io.emit('timerUpdate', timer, isPaused, 'Running');
            if(isPaused) io.emit('timerUpdate', timer, isPaused, 'Paused');     
        } 
    });


    socket.on('getData', () => {
        if(isPaused) io.emit('timerUpdate', timer, isPaused, 'Paused');
        if(!isPaused && timer > 0) io.emit('timerUpdate', timer, isPaused, 'Running');
        if(timer === 0) io.emit('timerUpdate', timer, isPaused, 'Ended');
    });

    socket.on('disconnect', () => {
        //clearInterval(timerInterval);
        console.log('A user disconnected');
    });

    //add a consol log on the server side to see if the client is connected
    console.log('A user connected to the Websocket server');

    socket.on('getNextGame', async () => {
        try {
            const currentGame = await Game.findOne({ status: 'active' }).exec();
            if (currentGame) {
                const nextGame = await Game.findOne({ number: currentGame.number + 1 }).exec();
                if (nextGame) {
                    const team1 = await Team.findById(nextGame.opponents[0]).exec();
                    const team2 = await Team.findById(nextGame.opponents[1]).exec();
                    nextGame.opponents[0] = team1 ? team1.name : 'Team not found';
                    nextGame.opponents[1] = team2 ? team2.name : 'Team not found';
                    socket.emit('nextGameData', {
                        time: nextGame.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        opponents: nextGame.opponents,
                        duration: nextGame.duration,
                        gameDisplayName: nextGame.gameDisplayName
                    });
                }
            }
        } catch (err) {
            console.error('Error fetching next game: ', err);
        }
    });

    socket.on('updateInfoBanner', (message) => {
        infoBannerMessage = message;
        console.log('Info banner message updated to: ', message);
        io.emit('updateInfoBanner', message);
    });

});


function resetTimer(duration) {
    clearInterval(timerInterval);
    console.log('Resetting timer to: ', duration);
    timer = duration;
    isPaused = true;
    
    if (duration === 0) {                                //if duration is 0, the game is ended
        io.emit('timerUpdate', timer, isPaused, 'Ended');
    }
    else {                                              //if duration is not 0, the game is ready to start and is paused                   
        io.emit('timerUpdate', timer, isPaused, 'Paused');
    }
}




// Render the game play page
router.get('/:id/play', async (req, res) => {
    try {
        const gameId = req.params.id;
        const game = await Game.findById(gameId).exec();

        // Fetch team names using the team IDs from the game object
        const team1 = await Team.findById(game.opponents[0]).exec();
        const team2 = await Team.findById(game.opponents[1]).exec();

        game.opponents[0] = team1 ? team1.name : 'Team not found';
        game.opponents[1] = team2 ? team2.name : 'Team not found';

        const durationInMillis = game.duration * 60 * 1000; // Convert minutes to milliseconds

        // set this to true if there are other games active
        const areOthergamesActive = await Game.exists({ status: 'active', _id: { $ne: gameId } }); // Check if there are other active games but not the current one
        const areOtherGamesActiveBool = Boolean(areOthergamesActive); // Convert to boolean
        console.log('areOtherGamesActive: ', areOtherGamesActiveBool);

        // Fetch and pass counters data
        const counters = await genCounters.findOne({}); // Assuming you have a single document for counters

        res.render('layouts/playGame', { socketConfig:socketConfig, game, durationInMillis, generalCounters: counters , areOtherGamesActiveBool, infoBannerMessage });
    } catch (err) {
        console.error('Error fetching game for play: ', err);
        res.status(500).send('Internal Server Error');
    }
});


// Start the game and update game stati
router.post('/start/:id', async (req, res) => {
    try {
        const gameId = req.params.id;
        const game = await Game.findById(gameId).exec();

        
        await Game.updateMany({ status: 'active' }, { status: 'ENDE' });    // Set other active games to END When new game starts
        await Game.findByIdAndUpdate(gameId, { status: 'active' });         // Set the game status to "active"

        console.log('Game set to active: ', gameId);
        resetTimer(game.duration*60);  // Reset the timer to the value 0 in seconds


        res.status(200).send('Game status set to active successfully');

        io.emit('reloadTVPage'); // Reload the TV page to show the updated game data

        
    } catch (err) {
        console.error('Error starting game: ', err);
        res.status(500).send('Internal Server Error');
    }
});

// change the game score
router.post('/:id/change-score/:teamId/:i', async (req, res) => {
    try {
        // Find the game by ID
        const game = await Game.findById(req.params.id).exec();

        // check wheter the goals will be decremented below 0 and if so, dont decrement
        if (game.goals[req.params.teamId-1] < 1 && req.params.i == -1) {
            res.status(304).send('Goals cannot be decremented below 0');
        } else {
            // Increment the score for the specified team
            game.goals[req.params.teamId-1] += parseInt(req.params.i);
            
            const { addRemoveSekt, allGoals} = await updateGenGoalsCounter(parseInt(req.params.i), parseInt(req.params.teamId));
            const updatedCounters = await genCounters.findOne({}); // Fetch updated counters

            if (req.params.i == -1) {            // -            // If the goal is decremented, remove the last goal from the game and player
                await removeLastGoalfromGameAndPlayer(game, req.params.teamId - 1); 
            }
            else {                               // +           // If the goal is incremented, add the goal to the game object
                // Add this goal to the goal log into the game object
                game.goalsLog.push({
                    timestamp: new Date(),
                    //Save the game timpstamp in seconds wich is the game duration minus the current timer value
                    gameTimestamp: game.duration*60 - timer,
                    teamIndex: req.params.teamId - 1,
                    newScore: game.goals,   
                    goalIndex: game.goalsLog.length + 1,
                    sekt_won: addRemoveSekt === 1 ? true : false,
                    goalIndexTournament: allGoals
                });
            }

            const updatedGame = await game.save(); // Save the updated game object

            res.status(200).json({ updatedGame, updatedCounters }); // Send the updated game object and counters as JSON

            if(addRemoveSekt !== 0){ // If the Sekt is won or removed
                const Sekt_Team_ID = parseInt(req.params.teamId); // Get the team ID that gets the Sekt
                if(addRemoveSekt === 1){ // If the sekt is won, increment the sektWon counter for the team
                    const team = await Team.findById(game.opponents[Sekt_Team_ID-1]).exec(); // Fetch the team that gets the Sekt
                    team.sektWon += 1; // Increment the sektWon counter for the team
                    console.log('Sektcounter incremented for team: ', team.name, ' to: ', team.sektWon);
                    await team.save(); // Save the updated team

                    await genCounters.findOneAndUpdate({}, { $inc: { wonSektBottles: 1 } }); // Increment the wonSektBottles counter

                    io.emit('Sekt', team); // Emit an event to the TV page to show the Sekt
                }
                else if(addRemoveSekt === -1){ // If the sekt is removed, decrement the sektWon counter for the team ?

                    //This solutuion is not perfect because if the goal wich let to the sekt is frm the other team whats happens then ?

                    // //console.log('Sekt Team ID: ', Sekt_Team_ID);
                    // const team = await Team.findById(game.opponents[Sekt_Team_ID-1]).exec(); // Fetch the team that gets the Sekt
                    // team.sektWon -= 1; // Decrement the sektWon counter for the team
                    // console.log('Sektcounter decremented for team: ', team.name, ' to: ', team.sektWon);
                    // await team.save(); // Save the updated team
                    
                }
            }

            io.emit('updateLiveGame', updatedGame);
        }
    } catch (err) {
        console.error('Error changing score: ', err); 
        res.status(500).send('Internal Server Error');
    }
});


router.post('/:id/updateLivePage', async (req, res) => {
    try {
        const game = await Game.findById(req.params.id).exec();
        res.status(200).send('Game send to Live page successfully');
        io.emit('updateLiveGame', game);
        io.emit('timerUpdate', timer, isPaused);
    } catch (err) {
        console.error('Error Updatng Live Page: ', err);
        res.status(500).send('Internal Server Error');
    }
});


// end a game
router.get('/:id/endGame', async (req, res) => {
    try {
        const gameId = req.params.id;
        const game = await Game.findById(gameId).exec();
        
        // Set the game status to "Ended" only if the status is "active"
        if (game.status == 'active') {
            await Game.findByIdAndUpdate(gameId, { status: 'Ended' });

            // Update the team data with the game results
            await writeGameDataToTeams(game);   
            await genCounters.findOneAndUpdate({}, { $inc: { gamesPlayed: 1 } });      // Increment the overall gamesPlayed counter

            // check whether the game was the last one of the group stage and if so, 
            //update the quarterfinals schedule by finding a game in group stage where the subsequent game is not in group stage
            const gamePhase = game.gamePhase;
            if(gamePhase === 'Group_Stage'){
                const subsequentGame = await Game.findOne({number: game.number+1}).exec();
                if(subsequentGame.gamePhase != 'Group_Stage'){
                    await updateQuarterFinalsSchedule();
                }
            } else {
                await updateSemiFinalsSchedule();
            }

            resetTimer(0);  // Reset the timer to the value 0 in seconds

            io.emit('reloadTVPage'); // Reload the TV page to show the updated game data
        }
        res.redirect('/schedule/list');
    
    } catch (err) {
        console.error('Error fetching game for END: ', err);
        res.status(500).send('Internal Server Error');
    }
});

const updateTeam = async (team, game, isWinner) => {
    team.gamesPlayed += 1;
    team.gamesPlayed_Group_Stage += (game.gamePhase === 'Group_Stage') ? 1 : 0;

    if (isWinner) {
        team.gamesWon += 1;
        team.points_Group_Stage += (game.gamePhase === 'Group_Stage') ? 3 : 0;
        team.points_General += 3;
    } else if (game.goals[0] === game.goals[1]) {
        team.gamesDraw += 1;
        team.points_Group_Stage += (game.gamePhase === 'Group_Stage') ? 1 : 0;
        team.points_General += 1;
    } else {
        team.gamesLost += 1;
    }


    if(game.opponents[0].toString() === team._id.toString()){ //check if the team is the first or second opponent
        team.goals[0] += game.goals[0]; //add the goals from the game to the team
        team.goals[1] += game.goals[1];

        if(game.gamePhase === 'Group_Stage'){
            team.goalsGroupStage[0] += game.goals[0]; //add the goals from the game to the gropstage goals
            team.goalsGroupStage[1] += game.goals[1];        
        }
    }
    else{
        team.goals[0] += game.goals[1];
        team.goals[1] += game.goals[0];

        if(game.gamePhase === 'Group_Stage'){
            team.goalsGroupStage[0] += game.goals[1]; //add the goals from the game to the gropstage goals
            team.goalsGroupStage[1] += game.goals[0];        
        }
    }
    return await team.save();
};

async function writeGameDataToTeams(game) {
    try {
        const team1 = await updateTeam(await Team.findById(game.opponents[0]), game, game.goals[0] > game.goals[1]);
        const team2 = await updateTeam(await Team.findById(game.opponents[1]), game, game.goals[1] > game.goals[0]);
    } catch (err) {
        console.error('Error updating teams:', err);
    }
}


// render the live game view
router.get('/live', async (req, res) => {
    try {
        const game = await Game.findOne({ status: 'active' }).exec();

        if (!game) {
            return res.render('layouts/liveGame', { socketConfig: socketConfig, game: null, noActiveGame: true, infoBannerMessage });
        }

        // Fetch team names using the team IDs from the game object
        const team1 = await Team.findById(game.opponents[0]).exec();
        const team2 = await Team.findById(game.opponents[1]).exec();

        // set them instead of the id - ATTENTION: dont change the db data
        game.opponents[0] = team1 ? team1.name : 'Team not found';
        game.opponents[1] = team2 ? team2.name : 'Team not found';
        
        res.render('layouts/liveGame', { socketConfig: socketConfig, game, noActiveGame: false, infoBannerMessage });
    } catch (err) {
        console.error('Error fetching live games: ', err);
        res.status(500).send('Internal Server Error');
    }
});

// Function to update allGoals counter
async function updateGenGoalsCounter(increment, teamId) {
    try {
        let counters = await genCounters.findOne({}); // Assuming you have a single document for counters
        if (!counters) {
            counters = new genCounters({ allGoals: 0 , gamesPlayed:0 , goalSektCounter: 0}); // Create a new counters document with allGoals set to 0
        }
        counters.allGoals += increment; // Increment allGoals counter (if increment is negative, it will decrement)
        if(counters.allGoals <= -1){counters.allGoals = 0;} // If allGoals can not be negative, set it to 0

        console.log(teamId);
        const TeamID = teamId;


        counters.goalSektCounter -= increment; // Decrement goalSektCounter counter (if increment is negative, it will increment)
        console.log('goalSektCounter: ', counters.goalSektCounter);
        
        const mainSettings = await MainSettings.findOne({}); // Fetch main settings
        const goalsforSekt = mainSettings.goalsforSekt;
    
        if(counters.goalSektCounter <= 0){	// If goalSektCounter counter is 0 or less the team wins an Sekt, reset it to default value
            console.log('Sekt won by team: ', TeamID);
            counters.goalSektCounter = goalsforSekt
            await counters.save(); // Save the updated counter value            
            return { addRemoveSekt: +1, allGoals: counters.allGoals}; // Returning an object with named properties
        }
        else if(counters.goalSektCounter > goalsforSekt){ // If goalSektCounter counter is higher than the default value, reset it to default value (this means that the teams sekt is withdrawn)
            counters.goalSektCounter = 1; // Reset the goalSektCounter counter to 1 because when the goal wich had set the counter to the goalsforSekt is removed, the counter should be 1 goal until sekt is won
            await counters.save(); // Save the updated counter value
            // return { teamId: TeamID, allGoals: counters.allGoals, removeSekt: true}; // Returning an object with named properties
            return { addRemoveSekt: -1, allGoals: counters.allGoals}; // Returning an object with named properties
        }
        else{
            await counters.save(); // Save the updated counter value
            return { addRemoveSekt: 0, allGoals: counters.allGoals}; // Returning an object with named properties
        }       
    } catch (err) {
        console.error('Error updating allGoals counter: ', err);
        return { addRemoveSekt: 0, allGoals: -1}; // Returning an object with named properties
    }
}

module.exports = {router, getInfoBannerMessage: () => infoBannerMessage};