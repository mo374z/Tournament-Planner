const e = require('express');
const mongoose = require('mongoose');
const Game = mongoose.model('Game');
const Team = mongoose.model('Team');

module.exports = {
    generateSemiFinalsSchedule,
    updateSemiFinalsSchedule
};

const { rankTeams } = require('../models/Team');

// Funktion um die Halbfinalspiele zu generieren
async function generateSemiFinalsSchedule(scheduleStartTime, gameDuration, timeBetweenGames, initialStatus, firstgameNumber, gamePhase, displayName) {

    try {
        //count the number of Quarterfinals games
        const countQuarterfinalsGames = await Game.countDocuments({ gamePhase: { $regex: new RegExp(`^Quarterfinals`) } });
        
        //check if the number of Quarterfinals games is 4 (if not, the Semifinals can not be generated)
        if (countQuarterfinalsGames === 4) {
            //generate Semifinals schedule
            const game1 = await findGamefromGamePhase("Quarterfinals 1");
            const game2 = await findGamefromGamePhase("Quarterfinals 2");
            const game3 = await findGamefromGamePhase("Quarterfinals 3");
            const game4 = await findGamefromGamePhase("Quarterfinals 4");
            
            let gameNumber = firstgameNumber;

            //generate 1. Semifinal game: (Sieger 1. Viertelfinale - Sieger 3.Viertelfinale)
            let gamePhaseNr = gamePhase + " 1"; //gamePhaseNr = "Semifinals 1"
            let displayNameNr = displayName + " 1";
            await createKnockoutGame(firstgameNumber, gameNumber, scheduleStartTime, gameDuration, timeBetweenGames,
                                    getTeam(game1, game1.gameDisplayName, true), getTeam(game3, game3.gameDisplayName, true), 
                                    initialStatus, gamePhaseNr, displayNameNr);
            gameNumber++;

            //generate 2. Semifinal game: (Sieger 2. Viertelfinale - Sieger 4.Viertelfinale)
            gamePhaseNr = gamePhase + " 2"; //gamePhaseNr = "Semifinals 2"
            displayNameNr = displayName + " 2";
            await createKnockoutGame(firstgameNumber, gameNumber, scheduleStartTime, gameDuration, timeBetweenGames,
                                        getTeam(game2, game2.gameDisplayName, true), getTeam(game4, game4.gameDisplayName, true), 
                                        initialStatus, gamePhaseNr, displayNameNr);
            gameNumber++;

            const semi1 = await findGamefromGamePhase("Semifinals 1");
            const semi2 = await findGamefromGamePhase("Semifinals 2");

            // change gamePhase to Finals
            gamePhase = "Finals";

            // generate 7rd place game: (Verlierer 3. Halbfinale - Verlierer 4. Halbfinale)
            gamePhaseNr = gamePhase + " 4";
            displayNameNr = "Spiel um Platz 7";
            await createKnockoutGame(firstgameNumber, gameNumber, scheduleStartTime, gameDuration, timeBetweenGames,
                                        createDummyTeam("7. Gesamtwertung"), createDummyTeam("8. Gesamtwertung"),
                                        initialStatus, gamePhaseNr, displayNameNr);
            gameNumber++;


            // generate 5rd place game: (Gewinner 3. Halbfinale - Gewinner 4. Halbfinale)
            gamePhaseNr = gamePhase + " 3";
            displayNameNr = "Spiel um Platz 5";
            await createKnockoutGame(firstgameNumber, gameNumber, scheduleStartTime, gameDuration, timeBetweenGames,
                                        createDummyTeam("5. Gesamtwertung"), createDummyTeam("6. Gesamtwertung"),
                                        initialStatus, gamePhaseNr, displayNameNr);
            gameNumber++;

            // generate 3rd place game: (Verlierer 1. Halbfinale - Verlierer 2. Halbfinale)
            gamePhaseNr = gamePhase + " 2";
            displayNameNr = "Spiel um Platz 3";
            await createKnockoutGame(firstgameNumber, gameNumber, scheduleStartTime, gameDuration, timeBetweenGames,
                                        getTeam(semi1, semi1.gameDisplayName, false), getTeam(semi2, semi2.gameDisplayName, false),
                                        initialStatus, gamePhaseNr, displayNameNr);
            gameNumber++;

            // generate Final game: (Sieger 1. Halbfinale - Sieger 2. Halbfinale)
            gamePhaseNr = gamePhase + " 1";
            displayNameNr = "Finale";
            await createKnockoutGame(firstgameNumber, gameNumber, scheduleStartTime, gameDuration, timeBetweenGames,
                                        getTeam(semi1, semi1.gameDisplayName, true), getTeam(semi2, semi2.gameDisplayName, true),
                                        initialStatus, gamePhaseNr, displayNameNr);

            // reading the end time of the last game from the database searching by gameNumber
            const latestGame = await Game.findOne({number: gameNumber}).exec();
            const lastGameEndTime = new Date(latestGame.time + gameDuration * 60000); //return the end time of the last game

            console.log('Knockout schedule generated and saved successfully!');
            return {
                lastSemiFinalsGameEndTime: lastGameEndTime,
                returnGameNumber2: gameNumber
            };

        } else {
            console.log("Number of Quarterfinals games is not 4: Knockout can not be generated");
            return {
                lastSemiFinalsGameEndTime: scheduleStartTime,
                returnGameNumber2: firstgameNumber
            };
        }

    } catch (err) {
        console.error('Error generating Knockout schedule: ', err);
        lastGameEndTime = scheduleStartTime; 
        return {
            lastSemiFinalsGameEndTime: lastGameEndTime,
            returnGameNumber2: gameNumber
        };
    }
}

//create a dummy team and set it as looser
const createDummyTeam = (name) => {
    return {
        name: name,
        group: "-",
        isDummy: true,
        gamesPlayed: 0,
    };
};


//create the game for the Semifinal game
const createKnockoutGame = async (firstgameNumber, gameNumber, scheduleStartTime, gameDuration, timeBetweenGames, Team1, Team2, initialStatus, gamePhase, displayName) => {
    gameStartTime = new Date(scheduleStartTime);
    gameStartTime.setMinutes(gameStartTime.getMinutes() + (gameNumber - firstgameNumber) * (gameDuration + timeBetweenGames));

    let newGame = new Game({
        number: gameNumber,
        time: gameStartTime,
        duration: gameDuration,
        status: initialStatus,
        opponents: [Team1, Team2],
        goals: [0, 0],
        gamePhase: gamePhase,
        gameDisplayName: displayName
    });

    // Ersetze echte Teams durch ihre IDs und Dummy-Teams bleiben
    if (!newGame.opponents[0].isDummy) {
        newGame.opponents[0] = looser1._id;
    }
    if (!newGame.opponents[1].isDummy) {
        newGame.opponents[1] = looser2._id;
    }

    await newGame.save();
};

//Search for a game with the given gamePhase
const findGamefromGamePhase = async (gamePhase) => {
    return await Game.findOne({ gamePhase: { $regex: new RegExp(`^${gamePhase}`) } });
};

const getTeam = (game, gameName, winner) => {
    if (game.status === "Ended") {
        const winningTeamIndex = game.goals[0] > game.goals[1] ? 0 : 1;
        return winner ? game.opponents[winningTeamIndex] : game.opponents[1 - winningTeamIndex];
    } else {
        console.log(`Game ${gameName} is not ended yet`);
        return winner ? createDummyTeam(`Sieger ${gameName}`) : createDummyTeam(`Verlierer ${gameName}`);
    }
};

async function updateSemiFinalsSchedule() {

    try {

        const Quartergame1 = await findGamefromGamePhase("Quarterfinals 1");
        const Quartergame2 = await findGamefromGamePhase("Quarterfinals 2");
        const Quartergame3 = await findGamefromGamePhase("Quarterfinals 3");
        const Quartergame4 = await findGamefromGamePhase("Quarterfinals 4");
        const Semigame1 = await findGamefromGamePhase("Semifinals 1");
        const Semigame2 = await findGamefromGamePhase("Semifinals 2");
        const Finalgame4 = await findGamefromGamePhase("Finals 4");
        const Finalgame3 = await findGamefromGamePhase("Finals 3");            
        const Finalgame2 = await findGamefromGamePhase("Finals 2");
        const Finalgame1 = await findGamefromGamePhase("Finals 1");

        let rankedLoosers = [];
        if (Quartergame1.status === "Ended" && Quartergame2.status === "Ended" && Quartergame3.status === "Ended" && Quartergame4.status === "Ended") {
            // rank the four looser teams of the Quarterfinals
            const looser1 = await Team.findById(getTeam(Quartergame1, Quartergame1.gameDisplayName, false)).exec();
            const looser2 = await Team.findById(getTeam(Quartergame2, Quartergame2.gameDisplayName, false)).exec();
            const looser3 = await Team.findById(getTeam(Quartergame3, Quartergame3.gameDisplayName, false)).exec();
            const looser4 = await Team.findById(getTeam(Quartergame4, Quartergame4.gameDisplayName, false)).exec();


            rankedLoosers = rankTeams([looser1, looser2, looser3, looser4]);

            await updateOpponents(Finalgame4, [rankedLoosers[2]._id, rankedLoosers[3]._id]);
            await updateOpponents(Finalgame3, [rankedLoosers[0]._id, rankedLoosers[1]._id]);
        }
        
        await updateKnockoutGame(Semigame2, Quartergame2, Quartergame4, true);
        await updateKnockoutGame(Semigame1, Quartergame1, Quartergame3, true);
        await updateKnockoutGame(Finalgame2, Semigame1, Semigame2, false);
        await updateKnockoutGame(Finalgame1, Semigame1, Semigame2, true);
        

        console.log('Semifinals schedule updated successfully!');   

    } catch (err) {
        console.error('Error updating Semifinals schedule: ', err);
    }
}

const updateOpponents = async (game, opponents) => {
    await Game.findByIdAndUpdate(game._id, { opponents });
    opponents.forEach(async (opponentId, index) => {
        if (!opponentId.isDummy) {
            const team = await Team.findById(opponentId);
            console.log(`Updated ${game.opponents[index].name} with ${team.name}`);
        } else {
            console.log("Error: One of the teams is a dummy team");
        }
    });
};

async function updateKnockoutGame(game, subgame1, subgame2, winner) {
    if (game.opponents[0].isDummy && game.opponents[1].isDummy && subgame1.status === "Ended" && subgame2.status === "Ended") {
        const opponent1_id = getTeam(subgame1, subgame1.gameDisplayName, winner);
        const opponent2_id = getTeam(subgame2, subgame2.gameDisplayName, winner);

        if (!opponent1_id.isDummy && !opponent2_id.isDummy) {
            await updateOpponents(game, [opponent1_id, opponent2_id]);
        }
    } else if (game.opponents[0].isDummy && subgame1.status === "Ended" && subgame2.status !== "Ended") {
        const opponent1_id = getTeam(subgame1, subgame1.gameDisplayName, winner);
        
        if (!opponent1_id.isDummy) {
            await updateOpponents(game, [opponent1_id, game.opponents[1]]);
        }
    } else if (game.opponents[1].isDummy && subgame2.status === "Ended") {
        const opponent2_id = getTeam(subgame2, subgame2.gameDisplayName, winner);

        if (!opponent2_id.isDummy) {
            await updateOpponents(game, [game.opponents[0], opponent2_id]);
        }
    } else {
        console.log(game.gamePhase + " can not be updated yet");
    }
}