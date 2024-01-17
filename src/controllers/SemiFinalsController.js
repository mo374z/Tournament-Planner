const e = require('express');
const mongoose = require('mongoose');
const Game = mongoose.model('Game');
const Team = mongoose.model('Team');

module.exports = {
    generateSemiFinalsSchedule,
    updateSemiFinalsSchedule
};

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

            //generate 3. Semifinal game: (Verlierer 1. Viertelfinale - Verlierer 3.Viertelfinale)

            let gamePhaseNr = gamePhase + " 3"; //gamePhaseNr = "Semifinals 3"
            let displayNameNr = displayName + " 3";
            await createKnockoutGame(firstgameNumber, gameNumber, scheduleStartTime, gameDuration, timeBetweenGames,
                                        getTeam(game1, game1.gameDisplayName, false), getTeam(game3, game3.gameDisplayName, false), 
                                        initialStatus, gamePhaseNr, displayNameNr);
            gameNumber++;

            //generate 4. Semifinal game: (Verlierer 2. Viertelfinale - Verlierer 4.Viertelfinale)
            gamePhaseNr = gamePhase + " 4"; //gamePhaseNr = "Semifinals 4"
            displayNameNr = displayName + " 4";
            await createKnockoutGame(firstgameNumber, gameNumber, scheduleStartTime, gameDuration, timeBetweenGames, 
                                        getTeam(game2, game2.gameDisplayName, false), getTeam(game4, game4.gameDisplayName, false), 
                                        initialStatus, gamePhaseNr, displayNameNr);
            gameNumber++;       

            //generate 1. Semifinal game: (Sieger 1. Viertelfinale - Sieger 3.Viertelfinale)
            gamePhaseNr = gamePhase + " 1"; //gamePhaseNr = "Semifinals 1"
            displayNameNr = displayName + " 1";
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
            const semi3 = await findGamefromGamePhase("Semifinals 3");
            const semi4 = await findGamefromGamePhase("Semifinals 4");

            // change gamePhase to Finals
            gamePhase = "Finals";

            // generate 7rd place game: (Verlierer 3. Halbfinale - Verlierer 4. Halbfinale)
            gamePhaseNr = gamePhase + " 4";
            displayNameNr = "Spiel um Platz 7";
            await createKnockoutGame(firstgameNumber, gameNumber, scheduleStartTime, gameDuration, timeBetweenGames,
                                        getTeam(semi3, semi3.gameDisplayName, false), getTeam(semi4, semi4.gameDisplayName, false),
                                        initialStatus, gamePhaseNr, displayNameNr);
            gameNumber++;


            // generate 5rd place game: (Gewinner 3. Halbfinale - Gewinner 4. Halbfinale)
            gamePhaseNr = gamePhase + " 3";
            displayNameNr = "Spiel um Platz 5";
            await createKnockoutGame(firstgameNumber, gameNumber, scheduleStartTime, gameDuration, timeBetweenGames,
                                        getTeam(semi3, semi3.gameDisplayName, true), getTeam(semi4, semi4.gameDisplayName, true),
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
        //seach for the games in the game schedule with Semifinals and update the dummys with teams if Quarterfinals are ended

        //Check if the Semifinals schedule is already generated
        const countSemiFinalsGames = await Game.countDocuments({ gamePhase: { $regex: new RegExp(`^Semifinals`) } });
        console.log("Number of Semifinals games: " + countSemiFinalsGames);

        if (countSemiFinalsGames === 4) {
            const Quartergame1 = await findGamefromGamePhase("Quarterfinals 1");
            const Quartergame2 = await findGamefromGamePhase("Quarterfinals 2");
            const Quartergame3 = await findGamefromGamePhase("Quarterfinals 3");
            const Quartergame4 = await findGamefromGamePhase("Quarterfinals 4");
            const Semigame1 = await findGamefromGamePhase("Semifinals 1");
            const Semigame2 = await findGamefromGamePhase("Semifinals 2");
            const Semigame3 = await findGamefromGamePhase("Semifinals 3");
            const Semigame4 = await findGamefromGamePhase("Semifinals 4");
            const Finalgame4 = await findGamefromGamePhase("Finals 4");
            const Finalgame3 = await findGamefromGamePhase("Finals 3");            
            const Finalgame2 = await findGamefromGamePhase("Finals 2");
            const Finalgame1 = await findGamefromGamePhase("Finals 1");

            await updateKnockoutGame(Semigame4, Quartergame2, Quartergame4, false);
            await updateKnockoutGame(Semigame3, Quartergame1, Quartergame3, false);            
            await updateKnockoutGame(Semigame2, Quartergame2, Quartergame4, true);
            await updateKnockoutGame(Semigame1, Quartergame1, Quartergame3, true);
            await updateKnockoutGame(Finalgame4, Semigame3, Semigame4, false);
            await updateKnockoutGame(Finalgame3, Semigame3, Semigame4, true);
            await updateKnockoutGame(Finalgame2, Semigame1, Semigame2, false);
            await updateKnockoutGame(Finalgame1, Semigame1, Semigame2, true);
            

            console.log('Semifinals schedule updated successfully!');   
        }
        else if (countSemiFinalsGames === 0) {
            console.log("Semifinals schedule is not generated yet");
        }
        else {
            console.log("Semifinals schedule is not generated correctly (not 4 games)");
        }

    } catch (err) {
        console.error('Error updating Semifinals schedule: ', err);
    }
}


async function updateKnockoutGame(game, subgame1, subgame2, winner) {
    console.log("Updating " + game.gamePhase + "...");
    
    const updateOpponents = async (opponents) => {
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

    if (game.opponents[0].isDummy && game.opponents[1].isDummy && subgame1.status === "Ended" && subgame2.status === "Ended") {
        const opponent1_id = getTeam(subgame1, subgame1.gameDisplayName, winner);
        const opponent2_id = getTeam(subgame2, subgame2.gameDisplayName, winner);

        if (!opponent1_id.isDummy && !opponent2_id.isDummy) {
            await updateOpponents([opponent1_id, opponent2_id]);
        }
    } else if (game.opponents[0].isDummy && subgame1.status === "Ended" && subgame2.status !== "Ended") {
        const opponent1_id = getTeam(subgame1, subgame1.gameDisplayName, winner);
        
        if (!opponent1_id.isDummy) {
            await updateOpponents([opponent1_id, game.opponents[1]]);
        }
    } else if (game.opponents[1].isDummy && subgame2.status === "Ended") {
        const opponent2_id = getTeam(subgame2, subgame2.gameDisplayName, winner);

        if (!opponent2_id.isDummy) {
            await updateOpponents([game.opponents[0], opponent2_id]);
        }
    } else {
        console.log(game.gamePhase + " can not be updated yet");
    }
}