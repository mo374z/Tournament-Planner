const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

let timer = 0;
let scoreTeamA = 0;
let scoreTeamB = 0;
let countdownInterval;

function startTimer() {
    clearInterval(countdownInterval);
    timer = 300; // 5 Minuten in Sekunden
    io.emit('timerUpdate', timer);
    countdownInterval = setInterval(() => {
        timer--;
        const minutes = Math.floor(timer / 60);
        const seconds = timer % 60;
        io.emit('timerUpdate', `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
        if (timer <= 0) {
            clearInterval(countdownInterval);
        }
    }, 1000);
}

function resetTimer() {
    clearInterval(countdownInterval);
    timer = 0;
    io.emit('timerUpdate', timer);
}

function pauseTimer() {
    clearInterval(countdownInterval);
}

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/live', (req, res) => {
    res.sendFile(__dirname + '/live.html');
});

io.on('connection', (socket) => {
    console.log('Benutzer verbunden');

    io.emit('timerUpdate', timer);
    io.emit('scoreUpdate', { teamA: scoreTeamA, teamB: scoreTeamB });

    socket.on('timerStart', () => {
        startTimer();
    });

    socket.on('timerReset', () => {
        resetTimer();
    });

    socket.on('timerPause', () => {
        pauseTimer();
    });

    socket.on('scoreEvent', (data) => {
        if (data.team === 'A') {
            scoreTeamA += data.change;
        } else if (data.team === 'B') {
            scoreTeamB += data.change;
        }
        io.emit('scoreUpdate', { teamA: scoreTeamA, teamB: scoreTeamB });
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});
