const express = require('express');
var router = express.Router();

const mongoose = require('mongoose');
const Game = mongoose.model('Game');
const Team = mongoose.model('Team');


const http = require('http');
const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);
//const io = new Server(server);

const cors = require('cors'); // Import cors middleware

// Enable CORS for Socket.IO
const io = socketIo(server, {
    cors: {
      origin: 'http://localhost:3000',   //'*', // Change this to your actual frontend URL in production for security
      methods: ['GET', 'POST'], // Add the allowed methods
     // allowedHeaders: ['my-custom-header'],
      credentials: true,
    }
  });

app.use(cors());


let timerInterval = null;
let timer = 0;
let isPaused = false;


// WebSocket logic
io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('startGame', (duration) => {
        clearInterval(timerInterval);
        console.log('Game Timer Started');

        timer = duration; // Set the initial timer duration
        timerInterval = setInterval(() => {
            if (timer > 0 && !isPaused) {
                timer--;
                io.emit('timerUpdate', timer);
            } else if (timer === 0) {
                clearInterval(timerInterval);
                io.emit('timerEnd');
            }
        }, 1000);
    });

    socket.on('resetGame', (duration) => {
        clearInterval(timerInterval);
        console.log('Game Timer Reset');
        timer = duration;
        io.emit('timerUpdate', timer);
        isPaused = true;
    });

    socket.on('pauseGame', () => {
        clearInterval(timerInterval);
        console.log('Game Timer Paused');
        isPaused = true; // Set the pause state
    });

    socket.on('continueGame', () => {
        if (isPaused) {
            console.log('Game TimerContinued');
            isPaused = false; // Reset the pause state
            timerInterval = setInterval(() => {
                if (timer > 0 && !isPaused) {
                    timer--;
                    io.emit('timerUpdate', timer);
                } else if (timer === 0) {
                    clearInterval(timerInterval);
                    io.emit('timerEnd');
                }
            }, 1000);
        }
    });

    socket.on('disconnect', () => {
        //clearInterval(timerInterval);
        console.log('A user disconnected');
    });
});



// Start the Websocet server on port 4000
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});




// GET /play/:id - Render the game play page
router.get('/:id/play', async (req, res) => {
    try {
        const gameId = req.params.id;
        const game = await Game.findById(gameId).exec();

        const durationInMinutes = game.duration;
        const durationInMillis = durationInMinutes * 60 * 1000; // Convert minutes to milliseconds

        // Fetch team names using the team IDs from the game object
        const team1 = await Team.findById(game.opponents[0]).exec();
        const team2 = await Team.findById(game.opponents[1]).exec();

        game.opponents[0] = team1 ? team1.name : 'Team not found';
        game.opponents[1] = team2 ? team2.name : 'Team not found';

        // Set the game status to "waiting" only if the status is not already "active"
        if (game.status !== 'active') {
        await Game.findByIdAndUpdate(gameId, { status: 'waiting' });
        }

        res.render('layouts/playGame', { game, durationInMillis });
    } catch (err) {
        console.error('Error fetching game for play: ', err);
        res.status(500).send('Internal Server Error');
    }
});



// POST /game/start/:id - Start the game and update game statuses
router.post('/start/:id', async (req, res) => {
    try {
        const gameId = req.params.id;
        const game = await Game.findById(gameId).exec();

        // Set the game status to "active"
        await Game.updateMany({ status: 'active' }, { status: 'END' }); // Set other active games to END
        await Game.findByIdAndUpdate(gameId, { status: 'active' });

        // Send a success response
        console.log('Game status set to active successfully');
        res.status(200).send('Game status set to active successfully');
    } catch (err) {
        console.error('Error starting game: ', err);
        res.status(500).send('Internal Server Error');
    }
});



// POST /game/:id/increment-score/:teamId
router.post('/:id/increment-score/:teamId', async (req, res) => {
    try {
        const gameId = req.params.id;
        const teamId = req.params.teamId;

        // Find the game by ID
        const game = await Game.findById(gameId).exec();

        // Increment the score for the specified team
        if (teamId === '1') {
            game.goals[0] += 1;
        } else if (teamId === '2') {
            game.goals[1] += 1;
        }

        // Save the updated game with the new scores
        const updatedGame = await game.save();

        res.status(200).json(updatedGame); // Send the updated game object as JSON
    } catch (err) {
        console.error('Error incrementing score: ', err);
        res.status(500).send('Internal Server Error');
    }
});

// POST /game/:id/decrement-score/:teamId
router.post('/:id/decrement-score/:teamId', async (req, res) => {
    try {
        const gameId = req.params.id;
        const teamId = req.params.teamId;

        // Find the game by ID
        const game = await Game.findById(gameId).exec();

        // Increment the score for the specified team
        if (teamId === '1') {
            game.goals[0] -= 1;
        } else if (teamId === '2') {
            game.goals[1] -= 1;
        }

        // Save the updated game with the new scores
        const updatedGame = await game.save();

        res.status(200).json(updatedGame); // Send the updated game object as JSON
    } catch (err) {
        console.error('Error incrementing score: ', err);
        res.status(500).send('Internal Server Error');
    }
});






// GET /live - Render the live game view
router.get('/live', async (req, res) => {
    try {
        const liveGame = await Game.findOne({ status: 'active' }).exec();

        if (!liveGame) {
            return res.render('layouts/liveGame', { liveGame: null, noActiveGame: true });
        }

        // Fetch team names using the team IDs from the game object
        const team1 = await Team.findById(liveGame.opponents[0]).exec();
        const team2 = await Team.findById(liveGame.opponents[1]).exec();

        liveGame.opponents[0] = team1 ? team1.name : 'Team not found';
        liveGame.opponents[1] = team2 ? team2.name : 'Team not found';

        res.render('layouts/liveGame', { liveGame, noActiveGame: false });
    } catch (err) {
        console.error('Error fetching live games: ', err);
        res.status(500).send('Internal Server Error');
    }
});



module.exports = router;