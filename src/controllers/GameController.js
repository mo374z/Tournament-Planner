const express = require('express');
var router = express.Router();

const mongoose = require('mongoose');
const Game = mongoose.model('Game');
const Team = mongoose.model('Team');
const MainSettings = mongoose.model('MainSettings');

const genCounters = mongoose.model('generalCounters');
const http = require('http');
const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);

module.exports = router;
const cors = require('cors'); // Import cors middleware

// Enable CORS for Socket.IO
const io = socketIo(server, {
    cors: {
      origin: '*', //'http://localhost:3000',  // Change this to your actual frontend URL in production for security - we changed this to * to handle a CORS error
      methods: ['GET', 'POST'], // Add the allowed methods
      credentials: true,
    }
  });

app.use(cors());


let timerInterval = null;
let timer = 0;
let isPaused = true;


// WebSocket logic
io.on('connection', (socket) => {

    socket.on('playPauseGame', () => {
        if (isPaused) {
            isPaused = false;
            timerInterval = setInterval(() => {
                if (timer > 0 && !isPaused) {
                    timer--;
                    io.emit('timerUpdate', timer, isPaused);
                } else if (timer === 0) {
                    clearInterval(timerInterval);
                    io.emit('timerEnd');
                    io.emit('timerUpdate', timer, isPaused);
                }
            }, 1000);
        } else {
            clearInterval(timerInterval);
            isPaused = true;
            io.emit('timerUpdate', timer, isPaused);
        }
});

    socket.on('resetGame', (duration) => {
        clearInterval(timerInterval);
        timer = duration;
        io.emit('timerUpdate', timer, isPaused);
        isPaused = true;
    });

    socket.on('getData', () => {
        io.emit('timerUpdate', timer, isPaused);
    });

    socket.on('disconnect', () => {
        //clearInterval(timerInterval);
        console.log('A user disconnected');
    });

});

// Start the Websocet server on port 4000
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Server for Websocet recieving is running on port ${PORT}`);
});


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

        await Game.updateMany({ status: 'waiting' }, { status: 'Scheduled' }); // Set other waiting games to Scheduled When new game is loaded

        // Set the game status to "waiting" only if the status is not already "active"
        if (game.status !== 'active') {
            await Game.findByIdAndUpdate(gameId, { status: 'waiting' });
        }

        // Fetch and pass counters data
        const counters = await genCounters.findOne({}); // Assuming you have a single document for counters

        res.render('layouts/playGame', { game, durationInMillis, generalCounters: counters });
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

        // Set the game status to "active"
        await Game.updateMany({ status: 'active' }, { status: 'ENDE' }); // Set other active games to END When new game starts
        await Game.findByIdAndUpdate(gameId, { status: 'active' });

        res.status(200).send('Game status set to active successfully');
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
            const updatedGame = await game.save();

            await updateGenGoalsCounter(parseInt(req.params.i), parseInt(req.params.teamId));

            const updatedCounters = await genCounters.findOne({}); // Fetch updated counters

            res.status(200).json({ updatedGame, updatedCounters }); // Send the updated game object and counters as JSON

            io.emit('updateLiveGame', updatedGame);
        }
    } catch (err) {
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
        
        // Set the game status to "ENDE" only if the status is "active"
        if (game.status == 'active') {
            await Game.findByIdAndUpdate(gameId, { status: 'ENDE' });
            io.emit('resetGame');
            console.log('Game status set to ENDE successfully');

            // Increment the gamesPlayed counter                                        //Other Solution: count the games with status ENDE: await Game.countDocuments({ status: 'ENDE' });
            await genCounters.findOneAndUpdate({}, { $inc: { gamesPlayed: 1 } });
        }

        res.redirect('/schedule/list');
    } catch (err) {
        console.error('Error fetching game for END: ', err);
        res.status(500).send('Internal Server Error');
    }
});

// render the live game view
router.get('/live', async (req, res) => {
    try {
        const game = await Game.findOne({ status: 'active' }).exec();

        if (!game) {
            return res.render('layouts/liveGame', { game: null, noActiveGame: true });
        }

        // Fetch team names using the team IDs from the game object
        const team1 = await Team.findById(game.opponents[0]).exec();
        const team2 = await Team.findById(game.opponents[1]).exec();

        // set them instead of the id - ATTENTION: dont change the db data
        game.opponents[0] = team1 ? team1.name : 'Team not found';
        game.opponents[1] = team2 ? team2.name : 'Team not found';
        
        res.render('layouts/liveGame', { game, noActiveGame: false });
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
        counters.allGoals += increment; // Increment allGoals counter
        counters.goalSektCounter -= increment; // Decrement goalSektCounter counter
    
        if(counters.goalSektCounter <= 0){	// If goalSektCounter counter is 0 or less, reset it to default value
            const mainSettings = await MainSettings.findOne({}); // Fetch main settings
            counters.goalSektCounter = mainSettings.goalsforSekt;
            await counters.save(); // Save the updated counter value            
            return teamId;
        }
        else{
            await counters.save(); // Save the updated counter value
            return 0;
        }        
    } catch (err) {
        console.error('Error updating allGoals counter: ', err);
    }
}