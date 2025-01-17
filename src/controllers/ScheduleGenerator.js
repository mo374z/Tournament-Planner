const mongoose = require('mongoose');
const Game = mongoose.model('Game');
const Team = mongoose.model('Team');
const yaml = require('js-yaml');
const fs = require('fs');

const { getAllGroupNames, getAllTeamsInGroup, rankTeams, getRank } = require('../models/Team');


class ScheduleGenerator {
    constructor(config, settings) {
        this.config = config;
        this.settings = settings;
        this.gameNumber = 1;
        this.currentTime = new Date(settings.TornamentStartTime - 60 * 60 * 1000);
    }

    async generateFullSchedule() {
        try {
            await this.clearGamesCollection();
            
            let lastGameEndTime = this.currentTime;
            
            if (this.config.group_stage.enabled) {
                lastGameEndTime = await this.generateGroupStage();
                this.currentTime = new Date(lastGameEndTime.getTime() + this.settings.timeBetweenGamePhases);
            }

            if (this.config.knockout_stage.quarterfinals.enabled) {
                lastGameEndTime = await this.generateQuarterFinals();
                this.currentTime = new Date(lastGameEndTime.getTime() + this.settings.timeBetweenGamePhases);
            }

            if (this.config.knockout_stage.semifinals.enabled) {
                lastGameEndTime = await this.generateSemiFinals();
                this.currentTime = new Date(lastGameEndTime.getTime() + this.settings.timeBetweenGamePhases);
            }

            if (this.config.knockout_stage.finals.enabled) {
                lastGameEndTime = await this.generateFinals();
            }

            return {
                success: true,
                lastGameEndTime: lastGameEndTime
            };
        } catch (error) {
            console.error('Error generating schedule:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async generateGroupStage() {
        const groups = this.config.group_stage.groups;
        const n = groups[0][1];
        
        const rounds = n - 1;
        const matchesPerRound = Math.floor(n / 2);
        const schedule = [];
        
        for (let round = 0; round < rounds; round++) {
            const roundMatches = [];
            for (let match = 0; match < matchesPerRound; match++) {
                const home = (round + match) % (n - 1);
                const away = (n - 1 - match + round) % (n - 1);
                
                if (match === 0) {
                    roundMatches.push([n - 1, away]);
                } else {
                    roundMatches.push([home, away]);
                }
            }
            schedule.push(roundMatches);
        }
    
        const groupTeams = {};
        for (const [groupName, _] of groups) {
            groupTeams[groupName] = await Team.find({ group: groupName }).exec();
        }
    
        for (let round = 0; round < schedule.length; round++) {
            for (const [home, away] of schedule[round]) {
                for (const [groupName, _] of groups) {
                    await this.createGame({
                        opponents: [
                            groupTeams[groupName][home]._id,
                            groupTeams[groupName][away]._id
                        ],
                        gamePhase: 'Group_Stage',
                        displayName: this.config.display.game_phase_names.group_stage,
                        duration: this.settings.gameDurationGroupStage / (1000 * 60),
                        round: round + 1
                    });
                }
            }
        }
    
        return this.getCurrentEndTime();
    }
    async generateQuarterFinals() {
        const matchups = this.config.knockout_stage.quarterfinals.matchups;
        let quarterFinalNumber = 1;

        for (const [[group1, pos1], [group2, pos2]] of matchups) {
            const team1 = await this.createDummyTeam(`${pos1}. aus Gruppe ${group1}`, group1);
            const team2 = await this.createDummyTeam(`${pos2}. aus Gruppe ${group2}`, group2);

            await this.createGame({
                opponents: [team1, team2],
                gamePhase: `Quarterfinals ${quarterFinalNumber}`,
                displayName: `${this.config.display.game_phase_names.quarterfinals} ${quarterFinalNumber}`,
                duration: this.settings.gameDurationQuarterfinals / (1000 * 60)
            });
            quarterFinalNumber++;
        }

        return this.getCurrentEndTime();
    }

    async generateSemiFinals() {
        const matchups = this.config.knockout_stage.semifinals.matchups;
        let semiFinalNumber = 1;

        for (const [[phase1, num1], [phase2, num2]] of matchups) {
            let phase1Display = phase1;
            let phase2Display = phase2;
            if(phase1 === 'Quarterfinals' && phase2 === 'Quarterfinals') {
                phase1Display = this.config.display.game_phase_names.quarterfinals;
                phase2Display = this.config.display.game_phase_names.quarterfinals;
            }
            // const team1 = await this.createDummyTeam(`Sieger ${phase1} ${num1}`, "-");
            const team1 = await this.createDummyTeam(`Sieger ${phase1Display} ${num1}`, "-");
            // const team2 = await this.createDummyTeam(`Sieger ${phase2} ${num2}`, "-");
            const team2 = await this.createDummyTeam(`Sieger ${phase2Display} ${num2}`, "-");

            await this.createGame({
                opponents: [team1, team2],
                gamePhase: `Semifinals ${semiFinalNumber}`,
                displayName: `${this.config.display.game_phase_names.semifinals} ${semiFinalNumber}`,
                duration: this.settings.gameDurationSemifinals / (1000 * 60)
            });
            semiFinalNumber++;
        }

        return this.getCurrentEndTime();
    }

    async generateFinals() {    
        // Generate placement matches if enabled (13-14, 11-12, 9-10, 7-8, 5-6)
        if (this.config.knockout_stage.finals.placement_matches.enabled) {
            const positions = this.config.knockout_stage.finals.placement_matches.positions;
            let matchNumber = positions.length + 2; // Start after bronze medal match
    
            for (const position of positions) {
                await this.createGame({
                    opponents: [
                        await this.createDummyTeam(`${position}. Gesamtwertung`, "-"),
                        await this.createDummyTeam(`${position + 1}. Gesamtwertung`, "-")
                    ],
                    gamePhase: `Finals ${matchNumber}`,
                    displayName: `${this.config.display.game_phase_names.placement} ${position}-${position + 1}`,
                    duration: this.settings.gameDurationFinal / (1000 * 60)
                });
                matchNumber--;
            }
        }
    
        // Generate bronze medal match (3rd-4th place)
        if (this.config.knockout_stage.finals.bronze_medal_match) {
            await this.createGame({
                opponents: [
                    await this.createDummyTeam("Verlierer Halbfinale 1", "-"),
                    await this.createDummyTeam("Verlierer Halbfinale 2", "-")
                ],
                gamePhase: "Finals 2",
                displayName: this.config.display.game_phase_names.bronze_medal,
                duration: this.settings.gameDurationFinal / (1000 * 60)
            });
        }
        
        // Generate last position match first (15th-16th place)
        if (this.config.knockout_stage.finals.last_position_match) {
            await this.createGame({
                opponents: [
                    await this.createDummyTeam("15. Gesamtwertung", "-"),
                    await this.createDummyTeam("16. Gesamtwertung", "-")
                ],
                gamePhase: "Finals Last",
                displayName: this.config.display.game_phase_names.last_position_match,
                duration: this.settings.gameDurationFinal / (1000 * 60)
            });
        }

        // Generate final match (1st-2nd place)
        await this.createGame({
            opponents: [
                await this.createDummyTeam("Sieger Halbfinale 1", "-"),
                await this.createDummyTeam("Sieger Halbfinale 2", "-")
            ],
            gamePhase: "Finals 1",
            displayName: this.config.display.game_phase_names.finals,
            duration: this.settings.gameDurationFinal / (1000 * 60)
        });
    
        return this.getCurrentEndTime();
    }

    async createGame({ opponents, gamePhase, displayName, duration }) {
        const gameStartTime = new Date(this.currentTime);
        
        if (this.gameNumber > 1) {
            // Add time between games to the current time
            gameStartTime.setMinutes(
                gameStartTime.getMinutes() + 
                (this.settings.timeBetweenGames / (1000 * 60))
            );
        }

        const newGame = new Game({
            number: this.gameNumber,
            time: gameStartTime,
            duration: duration,
            status: 'Scheduled',
            opponents: opponents,
            goals: [0, 0],
            gamePhase: gamePhase,
            gameDisplayName: displayName
        });

        await newGame.save();
        
        // Update current time to be the end of this game
        this.currentTime = new Date(gameStartTime.getTime() + (duration * 60 * 1000));
        this.gameNumber++;
        
        return newGame;
    }

    createDummyTeam(name, group) {
        return {
            name: name,
            group: group,
            isDummy: true,
            gamesPlayed: 0
        };
    }

    getCurrentEndTime() {
        const lastGame = new Date(this.currentTime);
        lastGame.setMinutes(lastGame.getMinutes() + this.settings.gameDurationFinal / (1000 * 60));
        return lastGame;
    }

    async clearGamesCollection() {
        await Game.deleteMany({});
    }

    // Update functions for knockout stages
    async updateQuarterFinals() {
        try {            
            const groupedTeams = {};
            const allTeams = await Team.find({}).exec();
            
            for (const group of getAllGroupNames(allTeams)) {
                groupedTeams[group] = await rankTeams(getAllTeamsInGroup(allTeams, group), true);
            }

            const games = await Game.find({ gamePhase: { $regex: /^Quarterfinals/ } });

            for (const game of games) {
                if (game.status === 'Ended') continue;

                const matchup = this.findMatchupForGame(game, 'quarterfinals');
                if (matchup) {
                    const [[group1, pos1], [group2, pos2]] = matchup;
                    const team1 = groupedTeams[group1][pos1 - 1];
                    const team2 = groupedTeams[group2][pos2 - 1];

                    if (team1 && team2) {
                        await Game.findByIdAndUpdate(game._id, {
                            opponents: [team1._id, team2._id]
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error updating quarter finals:', error);
        }
    }

    async updateGeneralKnockout(phase) {
        try {
            // Handle main games (semifinals, finals)
            const games = await Game.find({ gamePhase: { $regex: `^${phase}` } });
            
            for (const game of games) {
                if (game.status === 'Ended') continue;

                if (phase === 'Semifinals') {
                    const matchup = this.findMatchupForGame(game, 'semifinals');
                    await this.updateGameWithMatchup(game, matchup);
                } else if (phase === 'Finals') {
                    if (game.gamePhase === 'Finals 1') {
                        // Main final
                        await this.updateWithPreviousWinners(game, 'Semifinals', [1, 2]);
                    } else if (game.gamePhase === 'Finals 2' && this.config.knockout_stage.finals.bronze_medal_match) {
                        // Bronze medal match
                        await this.updateWithPreviousLosers(game, 'Semifinals', [1, 2]);
                    } else {
                        // Placement matches
                        await this.updatePlacementMatch(game);
                    }
                }
            }
        } catch (error) {
            console.error(`Error updating ${phase.toLowerCase()}:`, error);
        }
    }

    async updateGameWithMatchup(game, matchup) {
        if (!matchup) return;

        const [[phase1, num1], [phase2, num2]] = matchup;
        const sourceGame1 = await Game.findOne({ gamePhase: `${phase1} ${num1}` });
        const sourceGame2 = await Game.findOne({ gamePhase: `${phase2} ${num2}` });

        const updates = {};
        if (sourceGame1?.status === 'Ended') {
            updates['opponents.0'] = this.getWinner(sourceGame1);
        }
        if (sourceGame2?.status === 'Ended') {
            updates['opponents.1'] = this.getWinner(sourceGame2);
        }

        if (Object.keys(updates).length > 0) {
            await Game.findByIdAndUpdate(game._id, { $set: updates });
        }
    }

    async updateWithPreviousWinners(game, previousPhase, gameNumbers) {
        const previousGames = await Promise.all(
            gameNumbers.map(num =>
                Game.findOne({ gamePhase: `${previousPhase} ${num}` })
            )
        );
        
        const updates = {};
        previousGames.forEach((g, index) => {
            if (g?.status === 'Ended') {
                updates[`opponents.${index}`] = this.getWinner(g);
            }
        });
    
        if (Object.keys(updates).length > 0) {
            await Game.findByIdAndUpdate(game._id, { $set: updates });
        }
    }

    async updateWithPreviousLosers(game, previousPhase, gameNumbers) {
        const previousGames = await Promise.all(
            gameNumbers.map(num => 
                Game.findOne({ gamePhase: `${previousPhase} ${num}` })
            )
        );

        if (previousGames.every(g => g?.status === 'Ended')) {
            const losers = previousGames.map(g => this.getLoser(g));
            await Game.findByIdAndUpdate(game._id, {
                opponents: losers
            });
        }
    }

    async updatePlacementMatch(game) {
        if (!this.config.knockout_stage.finals.placement_matches.enabled) return;
    
        // Handle last position match (15th-16th place)
        if (game.gamePhase === 'Finals Last') {
            const allTeams = await Team.find({ group: { $in: ['A', 'B', 'C', 'D'] } }).exec();
            const teamsWithRanks = await Promise.all(
                allTeams.map(async team => ({
                    team,
                    overallRank: await getRank(team, false) // Use overall ranking instead of group ranking
                }))
            );

            //log the teams with their ranks
            for (const team of teamsWithRanks) {
                console.log(team.team.name + " " + team.overallRank);
            }
    
            // Sort by overall rank (descending) to get the two worst teams
            const sortedTeams = teamsWithRanks
                .sort((a, b) => b.overallRank - a.overallRank); // Higher rank number means worse position
    
            if (sortedTeams.length >= 2) {
                await Game.findByIdAndUpdate(game._id, {
                    opponents: [
                        sortedTeams[0].team._id, // Worst team
                        sortedTeams[1].team._id  // Second worst team
                    ]
                });
            }
            return;
        }
    
        // Handle regular placement matches
        const gameNumber = parseInt(game.gamePhase.split(' ')[1]);
        const positions = this.config.knockout_stage.finals.placement_matches.positions;
        const position = positions[positions.length - (gameNumber - 2)];
    
        if (position === undefined) return;
    
        // Get teams based on their position
        if (position === 5) {
            // 5-6th place: Best two quarterfinal losers
            const quarterFinalGames = await Game.find({ gamePhase: { $regex: /^Quarterfinals/ } });
            const quarterFinalLosers = quarterFinalGames
                .filter(g => g.status === 'Ended')
                .map(g => this.getLoser(g));
    
            if (quarterFinalLosers.length === 4) {
                const sortedLosers = await this.sortTeamsByPerformance(quarterFinalLosers);
                await Game.findByIdAndUpdate(game._id, {
                    opponents: [sortedLosers[0], sortedLosers[1]]
                });
            }
        } else if (position === 7) {
            // 7-8th place: Remaining quarterfinal losers
            const quarterFinalGames = await Game.find({ gamePhase: { $regex: /^Quarterfinals/ } });
            const quarterFinalLosers = quarterFinalGames
                .filter(g => g.status === 'Ended')
                .map(g => this.getLoser(g));
    
            if (quarterFinalLosers.length === 4) {
                const sortedLosers = await this.sortTeamsByPerformance(quarterFinalLosers);
                await Game.findByIdAndUpdate(game._id, {
                    opponents: [sortedLosers[2], sortedLosers[3]]
                });
            }
        } else {
            // 9th place and below: Use overall ranking
            const allTeams = await Team.find({ group: { $in: ['A', 'B', 'C', 'D'] } }).exec();
            const teamsWithRanks = await Promise.all(
                allTeams.map(async team => ({
                    team,
                    overallRank: await getRank(team, false) // Use overall ranking
                }))
            );
    
            // Sort by overall rank to get teams in correct order
            const sortedTeams = teamsWithRanks
                .sort((a, b) => a.overallRank - b.overallRank) // Lower rank number is better
                .slice(8); // Get teams from 9th place onwards
    
            // Find the two teams that should play for this position
            const index = Math.floor((position - 9) / 2) * 2;
            if (index >= 0 && index + 1 < sortedTeams.length) {
                await Game.findByIdAndUpdate(game._id, {
                    opponents: [
                        sortedTeams[index].team._id,
                        sortedTeams[index + 1].team._id
                    ]
                });
            }
        }
    }

    async sortTeamsByPerformance(teams) {
        // Sort teams based on their group stage performance
        const teamsWithStats = await Promise.all(teams.map(async team => {
            const groupRank = await getRank(team, true);
            return {
                team,
                groupRank,
                // Add more criteria if needed (points, goal difference, etc.)
            };
        }));

        return teamsWithStats
            .sort((a, b) => a.groupRank - b.groupRank)
            .map(t => t.team);
    }

    findMatchupForGame(game, phase) {
        const matchups = this.config.knockout_stage[phase].matchups;
        const gameNumber = parseInt(game.gamePhase.split(' ')[1]);
        return matchups[gameNumber - 1];
    }

    getWinner(game) {
        return game.goals[0] > game.goals[1] ? game.opponents[0] : game.opponents[1];
    }

    getLoser(game) {
        return game.goals[0] > game.goals[1] ? game.opponents[1] : game.opponents[0];
    }
}

module.exports = { ScheduleGenerator };