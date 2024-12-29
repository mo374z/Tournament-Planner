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
        const scheduling = this.config.group_stage.scheduling;

        for (let i = 0; i < groups[0][1]; i++) {
            for (let j = i + 1; j < groups[0][1]; j++) {
                for (const [groupName, _] of groups) {
                    const teamsInGroup = await Team.find({ group: groupName }).exec();
                    const team1 = teamsInGroup[i];
                    const team2 = teamsInGroup[j];

                    await this.createGame({
                        opponents: [team1._id, team2._id],
                        gamePhase: 'Group_Stage',
                        displayName: this.config.display.game_phase_names.group_stage,
                        duration: this.settings.gameDurationGroupStage / (1000 * 60)
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
            const team1 = await this.createDummyTeam(`Sieger ${phase1} ${num1}`, "-");
            const team2 = await this.createDummyTeam(`Sieger ${phase2} ${num2}`, "-");

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
        // Generate bronze medal match
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

        // Generate final match
        await this.createGame({
            opponents: [
                await this.createDummyTeam("Sieger Halbfinale 1", "-"),
                await this.createDummyTeam("Sieger Halbfinale 2", "-")
            ],
            gamePhase: "Finals 1",
            displayName: this.config.display.game_phase_names.finals,
            duration: this.settings.gameDurationFinal / (1000 * 60)
        });

        // Generate placement matches if enabled
        if (this.config.knockout_stage.finals.placement_matches.enabled) {
            const positions = this.config.knockout_stage.finals.placement_matches.positions;
            let matchNumber = 3;

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
                matchNumber++;
            }
        }

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
                groupedTeams[group] = rankTeams(getAllTeamsInGroup(allTeams, group), true);
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
                    } else if (parseInt(game.gamePhase.split(' ')[1]) > 2) {
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

        if (previousGames.every(g => g?.status === 'Ended')) {
            const winners = previousGames.map(g => this.getWinner(g));
            await Game.findByIdAndUpdate(game._id, {
                opponents: winners
            });
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

        const gameNumber = parseInt(game.gamePhase.split(' ')[1]);
        const positions = this.config.knockout_stage.finals.placement_matches.positions;
        const positionIndex = gameNumber - 3; // First placement match starts at Finals 3
        const position = positions[positionIndex];
        
        if (position === undefined) return;

        // Get all teams that didn't advance to quarterfinals
        const allTeams = await Team.find({ group: { $in: ['A', 'B', 'C', 'D'] } }).exec();
        const teamsWithRanks = await Promise.all(
            allTeams.map(async team => ({
                team,
                groupRank: await getRank(team, true) // Get group rank for each team
            }))
        );

        // Filter teams that didn't advance to quarterfinals (rank 3 and 4 in each group)
        const nonAdvancingTeams = teamsWithRanks
            .filter(({ groupRank }) => groupRank > 2)
            .sort((a, b) => a.groupRank - b.groupRank);

        // For position 5-6, we need losers from quarterfinals
        if (position === 5) {
            const quarterFinalGames = await Game.find({ gamePhase: { $regex: /^Quarterfinals/ } });
            const quarterFinalLosers = quarterFinalGames
                .filter(g => g.status === 'Ended')
                .map(g => this.getLoser(g));

            if (quarterFinalLosers.length === 4) {
                // Sort losers by their performance in quarterfinals and group stage
                const sortedLosers = await this.sortTeamsByPerformance(quarterFinalLosers);
                await Game.findByIdAndUpdate(game._id, {
                    opponents: [sortedLosers[0], sortedLosers[1]] // Best two losers play for 5th place
                });
            }
        }
        // For position 7-8, we use the remaining quarterfinal losers
        else if (position === 7) {
            const quarterFinalGames = await Game.find({ gamePhase: { $regex: /^Quarterfinals/ } });
            const quarterFinalLosers = quarterFinalGames
                .filter(g => g.status === 'Ended')
                .map(g => this.getLoser(g));
            if (quarterFinalLosers.length === 4) {
                const sortedLosers = await this.sortTeamsByPerformance(quarterFinalLosers);
                await Game.findByIdAndUpdate(game._id, {
                    opponents: [sortedLosers[2], sortedLosers[3]] // Lower ranked losers play for 7th place
                });
            }
        }
        // For positions 9 and below, we use teams that didn't advance from group stage
        else {
            const index = Math.floor((position - 9) / 2) * 2;
            if (index >= 0 && index + 1 < nonAdvancingTeams.length) {
                await Game.findByIdAndUpdate(game._id, {
                    opponents: [
                        nonAdvancingTeams[index].team._id,
                        nonAdvancingTeams[index + 1].team._id
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