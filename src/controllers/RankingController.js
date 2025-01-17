const mongoose = require('mongoose');
require('../models/Game'); // Importiere das Game Modell
const Game = mongoose.model('Game');


function sortTeamsByPerformance(teams) {
    return teams.sort((a, b) => {
        if (a.points_General !== b.points_General) {
            return b.points_General - a.points_General;
        } else {
            const goalDifferenceA = a.goals[0] - a.goals[1];
            const goalDifferenceB = b.goals[0] - b.goals[1];
            if (goalDifferenceA !== goalDifferenceB) {
                return goalDifferenceB - goalDifferenceA;
            } else {
                return b.goals[0] - a.goals[0];
            }
        }
    });
}

async function rankTeamsinController(teams, groupRank = false) {
    if (groupRank) {
        // For group ranking, use the existing logic
        return teams.sort((a, b) => {
            if (a.points_Group_Stage !== b.points_Group_Stage) {
                return b.points_Group_Stage - a.points_Group_Stage;
            } else {
                const goalDifferenceA = a.goalsGroupStage[0] - a.goalsGroupStage[1];
                const goalDifferenceB = b.goalsGroupStage[0] - b.goalsGroupStage[1];
                if (goalDifferenceA !== goalDifferenceB) {
                    return goalDifferenceB - goalDifferenceA;
                } else {
                    return b.goalsGroupStage[0] - a.goalsGroupStage[0];
                }
            }
        });

    } else {
        // Check if the current game phase is the group stage by checking if the group stage games are all played
        const allGames = await Game.find({}).exec();
        const groupStageGames = allGames.filter(game => game.gamePhase === 'Group_Stage');
        const allGroupStageGamesPlayed = groupStageGames.every(game => game.status === 'Ended');
        const allQuarterfinalsPlayed = allGames.filter(game => game.gamePhase.includes('Quarterfinals')).every(game => game.status === 'Ended');
        const allSemifinalsPlayed = allGames.filter(game => game.gamePhase.includes('Semifinals')).every(game => game.status === 'Ended');
        const allFinalsPlayed = allGames.filter(game => game.gamePhase.includes('Finals')).every(game => game.status === 'Ended');
        
        //search fro all games with the gamePhase "Finals"
        const finalsGames = allGames.filter(game => game.gamePhase.includes('Finals'));
        //suche das Spiel mit der kleinsten Zahl in number --> das erste Spiel
        const firstFinalsGame = finalsGames.reduce((min, game) => game.number < min.number ? game : min);
        const firstFinalsGameEnded = firstFinalsGame.status === 'Ended';


        // console.log("game phases:(group_stage, quarterfinals, semifinals, finals)");
        // console.log(allGroupStageGamesPlayed);
        // console.log(allQuarterfinalsPlayed);
        // console.log(allSemifinalsPlayed);
        // console.log(allFinalsPlayed);

        let currentGamePhase;
        if (!allGroupStageGamesPlayed) {
            currentGamePhase = 'group_stage';
        } else if (allGroupStageGamesPlayed && !allQuarterfinalsPlayed) {
            currentGamePhase = 'quarterfinals';
        } else if (allGroupStageGamesPlayed && allQuarterfinalsPlayed && !allSemifinalsPlayed) {
            currentGamePhase = 'semifinals';
        }else if (allGroupStageGamesPlayed && allQuarterfinalsPlayed && allSemifinalsPlayed && !firstFinalsGameEnded) {
            currentGamePhase = 'semifinals';
        } else if (allGroupStageGamesPlayed && allQuarterfinalsPlayed && allSemifinalsPlayed && !allFinalsPlayed && firstFinalsGameEnded) {
            currentGamePhase = 'finals';
        } else {
            currentGamePhase = 'group_stage';
        }

        console.log("Current game phase: " + currentGamePhase);
        

        if (currentGamePhase === 'group_stage' || currentGamePhase === 'quarterfinals') {
            // For overall ranking, first get qualified teams (top 2 from each group)
            const groupedTeams = {};
            const qualifiedTeams = [];
            const nonQualifiedTeams = [];

            // Group teams by their group
            teams.forEach(team => {
                if (!groupedTeams[team.group]) {
                    groupedTeams[team.group] = [];
                }
                groupedTeams[team.group].push(team);
            });

            // For each group, get top 2 teams
            Object.values(groupedTeams).forEach(groupTeams => {
                // Sort teams within group
                const sortedGroupTeams = groupTeams.sort((a, b) => {
                    if (a.points_Group_Stage !== b.points_Group_Stage) {
                        return b.points_Group_Stage - a.points_Group_Stage;
                    } else {
                        const goalDifferenceA = a.goalsGroupStage[0] - a.goalsGroupStage[1];
                        const goalDifferenceB = b.goalsGroupStage[0] - b.goalsGroupStage[1];
                        if (goalDifferenceA !== goalDifferenceB) {
                            return goalDifferenceB - goalDifferenceA;
                        } else {
                            return b.goalsGroupStage[0] - a.goalsGroupStage[0];
                        }
                    }
                });

                // Add top 2 to qualified teams
                qualifiedTeams.push(...sortedGroupTeams.slice(0, 2));
                // Add rest to non-qualified teams
                nonQualifiedTeams.push(...sortedGroupTeams.slice(2));
            });

            // Sort qualified teams based on overall performance
            const sortedQualifiedTeams = sortTeamsByPerformance(qualifiedTeams);

            // Sort non-qualified teams based on overall performance
            const sortedNonQualifiedTeams = sortTeamsByPerformance(nonQualifiedTeams);

            // Combine the sorted lists - qualified teams will always be ranked 1-8
            return [...sortedQualifiedTeams, ...sortedNonQualifiedTeams]; // Return the combined list
        } else if (currentGamePhase === 'semifinals') {

            // Add phase current phase to each team
            for (let team of teams) {
                let teamGames = await Game.find({ $or: [{ opponents: team._id }, { opponents: team._id }] }).exec();
                let teamPhase = "group_stage";
                for (let game of teamGames) {
                    //if the game has "Quarterfinals" in the game.gamePhase, the team is in the quarterfinals
                    if (game.gamePhase.includes("Quarterfinals")) {
                        teamPhase = "quarterfinals";
                        break;
                    }
                    //if the game has "Semifinals" in the game.gamePhase, the team is in the semifinals
                    if (game.gamePhase.includes("Semifinals")) {
                        teamPhase = "semifinals";
                        break;
                    }
                    //if the game has "Finals" in the game.gamePhase, the team is in the finals
                    if (game.gamePhase.includes("Finals")) {
                        teamPhase = "finals";
                        break;
                    }
                }
                team.phase = teamPhase;
            }

            // For semifinals, 
            //get the winners form the quarterfinals
            const quarterfinalsteams = teams.filter(team => team.phase === 'quarterfinals');
            //get the winners form the quarterfinals
            const sortedQuarterfinalsteams = sortTeamsByPerformance(quarterfinalsteams);
            //get the winners form the quarterfinals (4 first teams)
            const winnersQuarterfinals = sortedQuarterfinalsteams.slice(0, 4);
            //sort the winners of the quarterfinals
            const sortedWinnersQuarterfinals = sortTeamsByPerformance(winnersQuarterfinals);
            //get the losers form the quarterfinals (4 last teams)
            const losersQuarterfinals = sortedQuarterfinalsteams.slice(4, 8);
            //sort the losers of the quarterfinals
            const sortedLosersQuarterfinals = sortTeamsByPerformance(losersQuarterfinals);
            //get the other teams
            const otherTeams = teams.filter(team => !quarterfinalsteams.includes(team));
            //sort the other teams
            const sortedOtherTeams = sortTeamsByPerformance(otherTeams);
            //combine the sorted lists

            //console.log("Winner quarterfinals:" + printTeamNamePhase(winnersQuarterfinals));
            //console.log("Losers quarterfinals:" + printTeamNamePhase(losersQuarterfinals));
            //console.log("Other teams:" + printTeamNamePhase(sortedOtherTeams));

            return [...sortedWinnersQuarterfinals, ...sortedLosersQuarterfinals, ...sortedOtherTeams];            
        }
        else if (currentGamePhase === 'finals') {


            // Add phase current phase to each team
            for (let team of teams) {
                let teamGames = await Game.find({ $or: [{ opponents: team._id }, { opponents: team._id }] }).exec();
                let teamPhase = "group_stage";
                for (let game of teamGames) {
                    //if the game has "Quarterfinals" in the game.gamePhase, the team is in the quarterfinals
                    if (game.gamePhase.includes("Quarterfinals") || game.gamePhase.includes("Semifinals")) {
                        teamPhase = "not in finals";
                    }
                    //if the game has "Finals" in the game.gamePhase, the team is in the finals
                    if (game.gamePhase.includes("Finals")) {
                        const finalsNr = game.gamePhase.replace("Finals ", "");
                        teamPhase = "finals_" + finalsNr;
                    }
                }
                team.phase = teamPhase;
            }

            //console.log("Teams" + printTeamNamePhase(teams));

            // return sortTeamsByPerformance(teams);
        


        //Suche alle Spiel die in der gamePhase "FInals" enthalten
        const finalsGames = allGames.filter(game => game.gamePhase.includes('Finals'));
        // ersetzte im Spiel welche in der gamePhase "Last" enthält das Last durch die zahl 100 um das spiel zu sortieren
        //for each game with the word Last in the gamePhase, replace the word Last with the number 100 to sort the game
        finalsGames.forEach(game => {
            //entferne das Wort "Finals"
            game.gamePhase = game.gamePhase.replace('Finals ', '');
            if (game.gamePhase.includes('Last')) {
                game.gamePhase = game.gamePhase.replace('Last', '100');
            }
        });

        //sort the games by gamePhase the highest number schould be the first game
        finalsGames.sort((a, b) => {
            return b.gamePhase - a.gamePhase;
        });
        
        //Print the game number and gamePhase
        console.log("Finals games: " + '\n' + finalsGames.map(game => `${game.number} ${game.gamePhase}`).join('\n'));


        let FinalsRanking = [];

        //loop through all the games in the finals
        //this sorts all teams in the finals from the worst to the best
        for (let i = 0; i < finalsGames.length; i++) {
            let game = finalsGames[i];
            console.log("Checking game: " + game.number);
            //check if the game is ended
            if(game.status === 'Ended'){
                //get the winner of the game
                let winner = game.opponents[game.goals[0] > game.goals[1] ? 0 : 1];
                //get the loser of the game
                let loser = game.opponents[game.goals[0] > game.goals[1] ? 1 : 0];
                //get the winner team
                let winnerTeam = teams.find(team => team._id.equals(winner));
                //get the loser team
                let loserTeam = teams.find(team => team._id.equals(loser));

                console.log("Winner: " + winnerTeam.name);
                console.log("Looser: " + loserTeam.name);
                //add the Looser team to the FinalsRanking 
                FinalsRanking.push(loserTeam);
                //add the Winner team to the FinalsRanking 
                FinalsRanking.push(winnerTeam);
            }
            else { //if the game is not ended
                //get the Opponents of the game
                console.log("Game not ended");
                let opponent1 = teams.find(team => team._id.equals(game.opponents[0]));
                let opponent2 = teams.find(team => team._id.equals(game.opponents[1]));
                //rank the opponents by performance
                let sortedOpponents = sortTeamsByPerformance([opponent1, opponent2]);
                let betterOpponent = sortedOpponents[0];
                let worseOpponent = sortedOpponents[1];

                console.log("Better Opponent 1: " + betterOpponent.name);
                console.log("Opponent 2: " + worseOpponent.name);
                //add the sorted opponents to the FinalsRanking list
                FinalsRanking.push(worseOpponent);
                FinalsRanking.push(betterOpponent);
            }
           // console.log("Akt Finals ranking: " + '\n' + printTeamNamePhase(FinalsRanking));
        }

        //Drehe die Reihenfolge der Teams in der FinalsRanking Liste
        //Reverse the order of the teams in the FinalsRanking list
        FinalsRanking = FinalsRanking.reverse();

        //Print the ranking of the teams in the finals
        console.log("Finals ranking: " + '\n' + printTeamNamePhase(FinalsRanking));

        return sortTeamsByPerformance(FinalsRanking);
    }

        //     // For finals, rank the top 2 teams first
        //     const topTeams = teams.filter(team => team.phase === 'finals');
        //     const otherTeams = teams.filter(team => !topTeams.includes(team));

        //     const sortedTopTeams = sortTeamsByPerformance(topTeams);
        //     const sortedOtherTeams = sortTeamsByPerformance(otherTeams);

        //     return [...sortedTopTeams, ...sortedOtherTeams];
        // } else {
        //     // For quarterfinals, semifinals, and finals, rank the top 4 teams first
        //     const topTeams = teams.filter(team => team.phase === 'semifinals' || team.phase === 'finals');
        //     const otherTeams = teams.filter(team => !topTeams.includes(team));

        //     const sortedTopTeams = sortTeamsByPerformance(topTeams);
        //     const sortedOtherTeams = sortTeamsByPerformance(otherTeams);

        //     return [...sortedTopTeams, ...sortedOtherTeams];
        // }
    }
}



function printTeamNamePhase(teams) {
    return teams.map(team => `${team.name} ${team.phase}`).join('\n');
}

module.exports = {
    rankTeamsinController
};