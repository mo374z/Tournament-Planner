//const express = require('express');
//var router = express.Router();

const e = require('express');
const mongoose = require('mongoose');
const Game = mongoose.model('Game');
const Team = mongoose.model('Team');

// Funktion um die Halbfinalspiele zu generieren
async function generateSemiFinalsSchedule(scheduleStartTime, gameDuration, timeBetweenGames, initialStatus, gamePhase, FirstgameNumber) {

    try {

        //count the number of Quarterfinals games
        const countQuarterfinalsGames = await Game.countDocuments({ gamePhase: { $regex: new RegExp(`^Quarterfinals`) } });
        console.log("Number of Quarterfinals games: " + countQuarterfinalsGames);
        
        //check if the number of Quarterfinals games is 4 (if not, the Semifinals can not be generated)
        if (countQuarterfinalsGames === 4) {

            //generate Semifinals schedule: 
            // 3. Halbbfinale: Verlierer 1. Viertelfinale - Verlierer 3.Viertelfinale
            // 4. Halbfinale: Verlierer 2. Viertelfinale - Verlierer 4.Viertelfinale
            // 1. Halbfinale: Sieger 1. Viertelfinale - Sieger 3.Viertelfinale
            // 2. Halbfinale: Sieger 2. Viertelfinale - Sieger 4.Viertelfinale  
            
            let gameNumber = FirstgameNumber;

            //generate 3. Semifinal game: (Verlierer 1. Viertelfinale - Verlierer 3.Viertelfinale)
            const game1 = await findGamefromGamePhase("Quarterfinals 1");
            const game3 = await findGamefromGamePhase("Quarterfinals 3");
            const looser_Game1 = getLooser(game1, game1.gamePhase);
            const looser_Game3 = getLooser(game3, game3.gamePhase);
            const gameStartTime3 = new Date(scheduleStartTime); //set the start time for the first game
            let gamePhase_m_NR = gamePhase + " 3"; //gamePhase_m_NR = "Semifinals 3"
            await createSemifinalGame(gameNumber, gameStartTime3, gameDuration, looser_Game1, looser_Game3, initialStatus, gamePhase_m_NR);

            gameNumber++;

            //generate 4. Semifinal game: (Verlierer 2. Viertelfinale - Verlierer 4.Viertelfinale)
            const game2 = await findGamefromGamePhase("Quarterfinals 2");
            const game4 = await findGamefromGamePhase("Quarterfinals 4");
            const looser_Game2 = getLooser(game2, game2.gamePhase);
            const looser_Game4 = getLooser(game4, game4.gamePhase);
            const gameStartTime4 = new Date(scheduleStartTime);
            gameStartTime4.setMinutes(  //set the start time for the game 
                gameStartTime4.getMinutes() + (gameNumber - FirstgameNumber) * (gameDuration + timeBetweenGames)
            );
            gamePhase_m_NR = gamePhase + " 4"; //gamePhase_m_NR = "Semifinals 4"
            await createSemifinalGame(gameNumber, gameStartTime4, gameDuration, looser_Game2, looser_Game4, initialStatus, gamePhase_m_NR);

            gameNumber++;       

            //generate 1. Semifinal game: (Sieger 1. Viertelfinale - Sieger 3.Viertelfinale)
            const winner_Game1 = getWinner(game1, game1.gamePhase);
            const winner_Game3 = getWinner(game3, game3.gamePhase);
            const gameStartTime1 = new Date(scheduleStartTime);
            gameStartTime1.setMinutes(
                gameStartTime1.getMinutes() + (gameNumber - FirstgameNumber) * (gameDuration + timeBetweenGames)
            );
            gamePhase_m_NR = gamePhase + " 1"; //gamePhase_m_NR = "Semifinals 1"
            await createSemifinalGame(gameNumber, gameStartTime1, gameDuration, winner_Game1, winner_Game3, initialStatus, gamePhase_m_NR);

            gameNumber++;

            //generate 2. Semifinal game: (Sieger 2. Viertelfinale - Sieger 4.Viertelfinale)
            const winner_Game2 = getWinner(game2, game2.gamePhase);
            const winner_Game4 = getWinner(game4, game4.gamePhase);
            const gameStartTime2 = new Date(scheduleStartTime);
            gameStartTime2.setMinutes(
                gameStartTime2.getMinutes() + (gameNumber - FirstgameNumber) * (gameDuration + timeBetweenGames)
            );
            gamePhase_m_NR = gamePhase + " 2"; //gamePhase_m_NR = "Semifinals 2"
            await createSemifinalGame(gameNumber, gameStartTime2, gameDuration, winner_Game2, winner_Game4, initialStatus, gamePhase_m_NR);

            gameNumber++;

            const lastGameEndTime = new Date(gameStartTime2.getTime() + gameDuration * 60000); //return the end time of the last game

            console.log('Semifinals schedule generated and saved successfully!');
            return {
                lastSemiFinalsGameEndTime: lastGameEndTime,
                returnGameNumber2: gameNumber
            };

        } else {
            console.log("Number of Quarterfinals games is not 4: SemiFinals can not be generated");
            return {
                lastSemiFinalsGameEndTime: scheduleStartTime,
                returnGameNumber2: FirstgameNumber
            };
        }



    } catch (err) {
        console.error('Error generating Semifinals schedule: ', err);
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
const createSemifinalGame = async (gameNumber, gameStartTime, gameDuration, Team1, Team2, initialStatus, gamePhase) => {
    let newGame = new Game({
        number: gameNumber,
        time: gameStartTime,
        duration: gameDuration,
        status: initialStatus,
        opponents: [Team1, Team2],
        goals: [0, 0],
        gamePhase: gamePhase
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

//Search for the Quarterfinals game
const findGamefromGamePhase = async (gamePhase) => {
    return await Game.findOne({ gamePhase: { $regex: new RegExp(`^${gamePhase}`) } });
};

//check if game is Ended and get the looser
const getLooser = (game, gameName) => {
    if (game.status === "Ended") {
        if (game.goals[0] > game.goals[1]) {
            return game.opponents[1];
        } else {
            return game.opponents[0];
        }
    } else {
        console.log(`Game ${gameName} is not ended yet`);
        return createDummyTeam(`Verlierer ${gameName}`);
    }
};

//check if game is Ended and get the winner
const getWinner = (game, gameName) => {
    if (game.status === "Ended") {
        if (game.goals[0] > game.goals[1]) {
            return game.opponents[0];
        } else {
            return game.opponents[1];
        }
    } else {
        console.log(`Game ${gameName} is not ended yet`);
        return createDummyTeam(`Sieger ${gameName}`);
    }
};




async function updateSemiFinalsSchedule() {

    try {
        //seach for the games in the game schedule with Semifinals and update the dummys with teams if Quarterfinals are ended

        //Check if the Semifinals schedule is already generated
        const countSemiFinalsGames = await Game.countDocuments({ gamePhase: { $regex: new RegExp(`^Semifinals`) } });
        console.log("Number of Semifinals games: " + countSemiFinalsGames);

        if (countSemiFinalsGames === 4) {
                

            // 3. Halbbfinale: Verlierer 1. Viertelfinale - Verlierer 3.Viertelfinale
            // 4. Halbfinale: Verlierer 2. Viertelfinale - Verlierer 4.Viertelfinale
            // 1. Halbfinale: Sieger 1. Viertelfinale - Sieger 3.Viertelfinale
            // 2. Halbfinale: Sieger 2. Viertelfinale - Sieger 4.Viertelfinale 

            //serach for Semifinals 3 and update the dummys with the looser of Quarterfinals 1 and 3
            const Semigame3 = await findGamefromGamePhase("Semifinals 3");
            const Quartergame3 = await findGamefromGamePhase("Quarterfinals 3");
            const Quartergame1 = await findGamefromGamePhase("Quarterfinals 1");

            //async function updateSemiFinalGame(Semigame, Quartergame1, Quartergame3, WinnerLoser) { //WinnerLoser = true = Winner

            await updateSemiFinalGame(Semigame3, Quartergame1, Quartergame3, false);

            //serach for Semifinals 4 and update the dummys with the looser of Quarterfinals 2 and 4
            const Semigame4 = await findGamefromGamePhase("Semifinals 4");
            const Quartergame2 = await findGamefromGamePhase("Quarterfinals 2");
            const Quartergame4 = await findGamefromGamePhase("Quarterfinals 4");

            await updateSemiFinalGame(Semigame4, Quartergame2, Quartergame4, false);

            //serach for Semifinals 1 and update the dummys with the winner of Quarterfinals 1 and 3
            const Semigame1 = await findGamefromGamePhase("Semifinals 1");
            await updateSemiFinalGame(Semigame1, Quartergame1, Quartergame3, true);

            //serach for Semifinals 2 and update the dummys with the winner of Quarterfinals 2 and 4
            const Semigame2 = await findGamefromGamePhase("Semifinals 2");
            await updateSemiFinalGame(Semigame2, Quartergame2, Quartergame4, true);

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


async function updateSemiFinalGame(Semigame, Quartergame1, Quartergame3, WinnerLoser) { //WinnerLoser = true = Winner

    let opponent1_id;
    let opponent2_id;
    //check if the first and second team in the game are dummy teams and if the Quarterfinals games are ended
    console.log("Updating " + Semigame.gamePhase + "...");
    //console.log("Opponent 1: " + Semigame.opponents[0].name + " Opponent 2: " + Semigame.opponents[1].name);
    //console.log(Semigame.opponents[0].isDummy + " " + Semigame.opponents[1].isDummy + " " + Quartergame1.status + " " + Quartergame3.status)

    if (Semigame.opponents[0].isDummy && Semigame.opponents[1].isDummy && Quartergame1.status === "Ended" && Quartergame3.status === "Ended") {

        if(WinnerLoser){
            opponent1_id = getWinner(Quartergame1, Quartergame1.gamePhase);
            opponent2_id = getWinner(Quartergame3, Quartergame3.gamePhase);
        }
        else{
            opponent1_id = getLooser(Quartergame1, Quartergame1.gamePhase);
            opponent2_id = getLooser(Quartergame3, Quartergame3.gamePhase);
        }

        if(!opponent1_id.isDummy && !opponent2_id.isDummy){
            await Game.findByIdAndUpdate(Semigame._id, {
                opponents: [
                    opponent1_id,
                    opponent2_id
                ]
            });
            
            const team1 = await Team.findById(opponent1_id);
            const team3 = await Team.findById(opponent2_id);
            

            console.log("Updated " + Semigame.opponents[0].name + " with " + team1.name + " and " + Semigame.opponents[1].name + " with " + team3.name);
        }
        else{
            console.log("Error: One of the teams is a dummy team");
        }
        
    }
    else if (Semigame.opponents[0].isDummy && Quartergame1.status === "Ended" && Quartergame3.status !== "Ended") { //check if the first team in the game is a dummy team and if Quarterfinals 1 is ended and Quarterfinals 3 is not ended

        if(WinnerLoser){
            opponent1_id = getWinner(Quartergame1, Quartergame1.gamePhase);
        }
        else{
            opponent1_id = getLooser(Quartergame1, Quartergame1.gamePhase);
        }
        
        if(!opponent1_id.isDummy){

            await Game.findByIdAndUpdate(Semigame._id, {
                opponents: [
                    opponent1_id, //update the first team with the looser of Quarterfinals 1
                    Semigame.opponents[1] // Keep the second team
                ]
            });

            const team1 = await Team.findById(opponent1_id);
            console.log("Updated " + Semigame.opponents[0].name + " with " + team1.name);
        }
        else{
            console.log("Error: Teams is a dummy team");
        }

    }
    else if (Semigame.opponents[1].isDummy && Quartergame3.status === "Ended") { //check if the second team in the game is a dummy team and if Quarterfinals 3 is ended

        if(WinnerLoser){
            opponent2_id = getWinner(Quartergame3, Quartergame3.gamePhase);
        }
        else{
            opponent2_id = getLooser(Quartergame3, Quartergame3.gamePhase);
        }
        
        if(!opponent2_id.isDummy){

            await Game.findByIdAndUpdate(Semigame._id, {
                opponents: [
                    Semigame.opponents[0], // Keep the first team
                    opponent2_id, //update the second team with the looser of Quarterfinals 3

                ]
            });

            const team3 = await Team.findById(opponent2_id);
            console.log("Updated " + Semigame.opponents[1].name + " with " + team3.name);

        }
        else{
            console.log("Error: Teams is a dummy team");
        }

    }       
    else {
        console.log(Semigame.gamePhase + " can not be updated yet");
    }

}


module.exports = {
    generateSemiFinalsSchedule,
    updateSemiFinalsSchedule
};