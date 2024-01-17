const mongoose = require('mongoose');
const Game = mongoose.model('Game');
const Team = mongoose.model('Team');

module.exports = {
    generateQuarterFinalsSchedule,
    updateQuarterFinalsSchedule
};

const { getRank } = require('../models/Team');


// Funktion um die Viertelfinalspiele zu generieren
async function generateQuarterFinalsSchedule(scheduleStartTime, gameDuration, timeBetweenGames, initialStatus, gameNumber, gamePhase, displayName) {
    try {
        const teams = await Team.find({});
        const groupedTeams = await groupedTeamsPerGroupAndRank(teams);
        const teamsInQuarterFinals = [];

        // Create dummy teams for Quarterfinals
        for (const group in groupedTeams) {
            const dummyTeam1 = {
                name: `1. aus Gruppe ${group}`,
                group: group,
                isDummy: true,
                gamesPlayed: 0,
            };
            const dummyTeam2 = {
                name: `2. aus Gruppe ${group}`,
                group: group,
                isDummy: true,
                gamesPlayed: 0,
            };
            teamsInQuarterFinals.push(dummyTeam1);
            teamsInQuarterFinals.push(dummyTeam2);
        }

        const FirstgameNumber = gameNumber;

        let lastGameEndTime = 0;
        
        Number_of_groups = Object.keys(groupedTeams).length;
        console.log("Number of groups: " + Number_of_groups);

        if (Number_of_groups === 4) {
            // Erzeuge die Viertelfinalspiele für 4 Gruppen
            for (let i = 0; i < teamsInQuarterFinals.length - 2; i += 4) {
                for (let j = 0; j < 2; j++) {
                    let team1 = teamsInQuarterFinals[i + j];
                    let team2 = teamsInQuarterFinals[i + 3 - j];
                    let gamePhaseNr = gamePhase + " " + (gameNumber - FirstgameNumber + 1).toString();
                    let displayNameNr = "Viertelfinale " + (gameNumber - FirstgameNumber + 1).toString();
                    console.log(gamePhaseNr);
                    let GameEndTime = await SaveQuarterfinalsGame(team1, team2, scheduleStartTime, gameDuration, timeBetweenGames, initialStatus, gamePhaseNr, FirstgameNumber, gameNumber, displayNameNr);
                    if (GameEndTime !== 0) {
                        lastGameEndTime = GameEndTime;
                    }
                    gameNumber++;
                }
            }
            console.log('Quarterfinals schedule for 4 groups generated and saved successfully!');
        }
        else if(Number_of_groups === 3){
            // Erzeuge die Viertelfinalspiele für 3 Gruppen
            console.log("Games for 3 groups arent implemented yet");
        }
        else if (Number_of_groups === 2){
            // Erzeuge die Viertelfinalspiele für 2 Gruppen
            console.log("Games for 2 groups arent implemented yet");
        }

       return {
            lastQuarterFinalsGameEndTime: lastGameEndTime,
            returnGameNumber1: gameNumber
        };

        
    } catch (err) {
        console.error('Error generating Quarterfinals schedule: ', err);
        lastGameEndTime = scheduleStartTime; 
        return {
            lastGameEndTime: lastGameEndTime,
            returnGameNumber: gameNumber
        };
    }
}

// Funktion um die Viertelfinalspiele zu speichern
async function SaveQuarterfinalsGame(team1, team2, scheduleStartTime, gameDuration, timeBetweenGames, initialStatus, gamePhase, FirstgameNumber, gameNumber, displayName) {
    if (team1 && team2 && team1.group !== team2.group) {
        console.log(`Spiel generiert: Team 1: ${team1.name} vs. Team 2: ${team2.name}`);

        const gameStartTime = new Date(scheduleStartTime);
        if (gameNumber > FirstgameNumber) {
            gameStartTime.setMinutes(
                gameStartTime.getMinutes() + (gameNumber - FirstgameNumber) * (gameDuration + timeBetweenGames)
            );
        }

        let newGame = new Game({
            number: gameNumber,
            time: gameStartTime,
            duration: gameDuration,
            status: initialStatus,
            opponents: [team1, team2],
            goals: [0, 0],
            gamePhase: gamePhase,
            gameDisplayName: displayName
        });

        // Ersetze echte Teams durch ihre IDs und Dummy-Teams bleiben
        if (!newGame.opponents[0].isDummy) {
            newGame.opponents[0] = team1._id;
        }
        if (!newGame.opponents[1].isDummy) {
            newGame.opponents[1] = team2._id;
        }

        await newGame.save();

        return new Date(newGame.time.getTime() + newGame.duration * 60000); //return the end time of the game
       
    } else {
        console.log(`Spiel nicht generiert da gleiche Gruppe: Team 1: ${team1.name} vs. Team 2: ${team2.name}`);
        return 0;
    }
}

// Funktion um die Viertelfinalspiele zu aktualisieren
async function updateQuarterFinalsSchedule() {

    try {
        //seach for the games in the game schedule with gamePhase Quarterfinals and update them with the new teams when team data was updated
        
        const teams = await Team.find({});
        const groupedTeams = await groupedTeamsPerGroupAndRank(teams);

        const games = await Game.find({ gamePhase: { $regex: /^Quarterfinals/ } }); // Find all games with gamePhase starting with 'Quarterfinals'


        for (const game of games) {
            if (game.status === 'Ended') continue; // Skip games that have already ended
            // KNOWN BUG: change this to not rely on the dummy name for generation (skipped for now)
            const team1Index = game.opponents[0].name.startsWith('1.') ? 0 : 1;
            const team2Index = game.opponents[1].name.startsWith('1.') ? 0 : 1;
            const team1 = groupedTeams[game.opponents[0].group][team1Index];
            const team2 = groupedTeams[game.opponents[1].group][team2Index];

            await Game.findByIdAndUpdate(game._id, {
                opponents: [
                    team1._id,
                    team2._id
                ]
            });

            console.log(`Updated game ${game.number} with new opponents: ${team1.name} vs. ${team2.name}`);
        }


        console.log('Quarterfinals schedule updated successfully!');
    } catch (err) {
        console.error('Error updating Quarterfinals schedule: ', err);
    }
}

//TODO: implement a function that determines, wheter a team is qualified for the quarterfinals or not (e.g. cannot be changed in rank before las game of group stage is played)


async function groupedTeamsPerGroupAndRank(teams){
    let groupedTeams = {};
    // Gruppiere die Teams nach ihren Gruppen
    teams.forEach(team => {
        if (!groupedTeams[team.group]) {
            groupedTeams[team.group] = [];
        }
        groupedTeams[team.group].push(team);
    });

    // Sortiere die Teams in jeder Gruppe nach Rang
    for (const group in groupedTeams) {

        for (const team of groupedTeams[group]) {
            team.rank = await getRank(team);
            console.log("Got rank for team " + team.name + ": " + team.rank);
        }

        // sort the teams by rank
        groupedTeams[group].sort((a, b) => a.rank - b.rank);            
    }

    console.log(groupedTeams);

    return groupedTeams;
}