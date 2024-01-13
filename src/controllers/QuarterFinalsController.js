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
        const groupedTeams = {};

        // Gruppiere die Teams nach ihren Gruppen
        teams.forEach(team => {
            if (!groupedTeams[team.group]) {
                groupedTeams[team.group] = [];
            }
            groupedTeams[team.group].push(team);
        });

        // Sortiere die Teams in jeder Gruppe nach Rang
        for (const group in groupedTeams) {

            // get the rank of each team
            groupedTeams[group].forEach(team => {
                team.rank = getRank(team);
            });
            // sort the teams by rank
            groupedTeams[group].sort((a, b) => a.rank - b.rank);            
        }

        const teamsInQuarterFinals = [];

        // Bestimme die Teams für die Viertelfinals
        for (const group in groupedTeams) {
            if (groupedTeams[group].length >= 2 && groupedTeams[group][0].gamesPlayed > 0) {
                teamsInQuarterFinals.push(groupedTeams[group][0]);
                teamsInQuarterFinals.push(groupedTeams[group][1]);
            } else if (groupedTeams[group].length === 1 && groupedTeams[group][0].gamesPlayed > 0) {
                teamsInQuarterFinals.push(groupedTeams[group][0]);
                
                const dummyTeam1 = {
                    name: `2. aus Gruppe ${group}`,
                    group: group,
                    isDummy: true,
                    gamesPlayed: 0,
                };
                teamsInQuarterFinals.push(dummyTeam1);
            } else {
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
            groupedTeams[group].sort((a, b) => b.points_Group_Stage - a.points_Group_Stage);
        }

        //print the grouped teams
        for (const group in groupedTeams) {
            console.log("Group: " + group);
            for (const team of groupedTeams[group]) {
                console.log("Team: " + team.name + " Points in Group_Stage: " + team.points_Group_Stage + " Games Played: " + team.gamesPlayed);
            }
        }

        console.log("Updating Quarterfinals schedule...");

        const games = await Game.find({ gamePhase: { $regex: /^Quarterfinals/ } }); // Find all games with gamePhase starting with 'Quarterfinals'

        for (const group in groupedTeams) {
            if (groupedTeams[group][0].gamesPlayed > 0 || groupedTeams[group][1].gamesPlayed > 0) { //check if the first 2 teams in the group have played at least 1 game
                for (const game of games) {
                    if (game.opponents[0].isDummy && game.opponents[0].group === group) {       //check if the first team in the game is a dummy team and if it is in the group
                        const teamIndex = game.opponents[0].name.startsWith('1.') ? 0 : 1;
                        await Game.findByIdAndUpdate(game._id, {
                            opponents: [
                                groupedTeams[group][teamIndex]._id,
                                game.opponents[1] // Keep the second team
                            ]
                        });
                        console.log("Updated " + game.opponents[0].name + " with " + groupedTeams[group][teamIndex].name);
                    } else if (game.opponents[1].isDummy && game.opponents[1].group === group) { //check if the second team in the game is a dummy team and if it is in the group
                        const teamIndex = game.opponents[1].name.startsWith('1.') ? 0 : 1;
                        await Game.findByIdAndUpdate(game._id, {
                            opponents: [
                                game.opponents[0], // Keep the first team
                                groupedTeams[group][teamIndex]._id
                            ]
                        });
                        console.log("Updated " + game.opponents[1].name + " with " + groupedTeams[group][teamIndex].name);
                    }
                }
            } else {
                console.log(`Insufficient data in Group ${group}`);
            }
        }

        console.log('Quarterfinals schedule updated successfully!');
    } catch (err) {
        console.error('Error updating Quarterfinals schedule: ', err);
    }
}