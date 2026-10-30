const mongoose = require('mongoose');
const Game = mongoose.model('Game');
const Team = mongoose.model('Team');

const { loadTemplate, validateTemplate } = require('../services/tournamentTemplate');
const rules = require('../services/tournamentRules');
const { syncDecisions, getAllDecisions } = require('../services/decisions');

const MINUTE = 60 * 1000;

// Erzeugt den kompletten Spielplan aus einem Schedule-Template (YAML) und belegt Platzhalter-Spiele
// im Turnierverlauf neu. Alle Regeln stammen aus dem Template, siehe src/services/tournamentRules.js.
class ScheduleGenerator {
    constructor(config, settings) {
        this.config = config;
        this.settings = settings;
        this.gameNumber = 1;
        this.currentTime = new Date(settings.TornamentStartTime);
    }

    static fromSettings(settings) {
        return new ScheduleGenerator(loadTemplate(settings.scheduleTemplate), settings);
    }

    async generateFullSchedule() {
        try {
            const errors = validateTemplate(this.config);
            if (errors.length) throw new Error(`Das gewählte Schedule-Template ist fehlerhaft und kann nicht verwendet werden:\n- ${errors.join('\n- ')}`);

            const teams = await Team.find({}).exec();
            this.checkTeams(teams);

            await Game.deleteMany({});
            await mongoose.model('Decision').deleteMany({});
            this.gameNumber = 1;
            this.currentTime = new Date(this.settings.TornamentStartTime);

            let lastGameEndTime = this.currentTime;
            const gs = this.config.group_stage;
            const ko = this.config.knockout_stage;
            const phases = (ko && ko.enabled !== false ? ko.phases : []).filter(p => p.enabled !== false);

            const steps = [];
            if (gs.enabled !== false) steps.push(() => this.generateGroupStage(teams));
            for (const phase of phases) steps.push(() => this.generateKnockoutPhase(phase, teams));

            for (let i = 0; i < steps.length; i++) {
                lastGameEndTime = await steps[i]();
                if (i < steps.length - 1) {
                    this.currentTime = new Date(lastGameEndTime.getTime() + this.settings.timeBetweenGamePhases);
                }
            }

            return { success: true, lastGameEndTime };
        } catch (error) {
            console.error('Error generating schedule:', error);
            return { success: false, error: error.message };
        }
    }

    // Teamanzahl pro Gruppe muss zum Template passen; sammelt alle Probleme in einer verständlichen Meldung
    checkTeams(teams) {
        const gs = this.config.group_stage;
        if (gs.enabled === false) return;
        const name = (this.config.meta && this.config.meta.name) || 'Template';
        const expectedTotal = gs.groups.reduce((s, g) => s + g.teams, 0);
        const groupList = gs.groups.map(g => `${g.name} (${g.teams} Teams)`).join(', ');
        const known = gs.groups.map(g => g.name);
        const problems = [];

        if (teams.length !== expectedTotal) {
            const diff = teams.length - expectedTotal;
            problems.push(`Das Template erwartet ${expectedTotal} Teams in ${gs.groups.length} Gruppen, es sind aber ${teams.length} Teams angelegt (${diff > 0 ? `${diff} zu viele` : `${-diff} zu wenige`}).`);
        }

        const stray = teams.filter(t => !known.includes(t.group));
        if (stray.length) {
            const usedGroups = [...new Set(teams.map(t => t.group || '-'))];
            problems.push(`Das Template hat nur die Gruppen ${known.join(', ')}, die Teams sind aber auf ${usedGroups.length} Gruppen verteilt (${usedGroups.join(', ')}). Diese Teams gehören zu einer Gruppe, die es im Template nicht gibt: ${stray.map(t => `${t.name} (Gruppe ${t.group || '-'})`).join(', ')}.`);
        }

        for (const g of gs.groups) {
            const count = teams.filter(t => t.group === g.name).length;
            if (count !== g.teams) {
                problems.push(`Gruppe ${g.name}: erwartet ${g.teams} Teams, vorhanden ${count} (${count > g.teams ? `${count - g.teams} zu viele` : `${g.teams - count} zu wenige`}).`);
            }
        }

        if (problems.length) {
            throw new Error(`Die Teams passen nicht zum gewählten Schedule-Template "${name}" (${groupList}). ${problems.join(' ')} Bitte Teams/Gruppen anpassen oder in den Main Settings ein anderes Template wählen.`);
        }
    }

    async generateGroupStage(teams) {
        const gs = this.config.group_stage;
        const fmt = gs.format || {};
        const groups = gs.groups.map(g => {
            let members = teams.filter(t => t.group === g.name);
            if (fmt.seeding === 'random') members = members.sort(() => Math.random() - 0.5);
            return { name: g.name, members, rounds: rules.buildRoundRobin(g.teams, fmt.legs || 1) };
        });
        const roundCount = Math.max(...groups.map(g => g.rounds.length));
        const slotCount = Math.max(...groups.flatMap(g => g.rounds.map(r => r.length)));
        const duration = this.settings[gs.duration_setting] / MINUTE;

        const create = (group, home, away) => this.createGame({
            opponents: [group.members[home]._id, group.members[away]._id],
            gamePhase: gs.game_phase_key,
            displayName: gs.display_name,
            duration
        });

        if (fmt.game_order === 'by_group') {
            for (const group of groups) {
                for (const round of group.rounds) {
                    for (const [home, away] of round) await create(group, home, away);
                }
            }
        } else {
            for (let round = 0; round < roundCount; round++) {
                for (let slot = 0; slot < slotCount; slot++) {
                    for (const group of groups) {
                        const pair = group.rounds[round] && group.rounds[round][slot];
                        if (pair) await create(group, pair[0], pair[1]);
                    }
                }
            }
        }
        return this.getCurrentEndTime();
    }

    async generateKnockoutPhase(phase, teams) {
        const ctx = rules.buildContext(this.config, teams, []);
        const duration = this.settings[phase.duration_setting] / MINUTE;
        for (let i = 0; i < phase.matches.length; i++) {
            const match = phase.matches[i];
            const opponents = [match.home, match.away].map(src => {
                const team = rules.resolveSource(src, ctx);
                return team ? team._id : rules.placeholderTeam(src, this.config);
            });
            await this.createGame({
                opponents,
                gamePhase: `${phase.game_phase_key} ${i + 1}`,
                displayName: rules.matchDisplayName(match, phase, i),
                duration,
                finalPlacement: match.final_placement || null,
                matchId: match.id
            });
        }
        return this.getCurrentEndTime();
    }

    async createGame({ opponents, gamePhase, displayName, duration, finalPlacement = null, matchId = null }) {
        const gameStartTime = new Date(this.currentTime);

        if (this.gameNumber > 1) {
            gameStartTime.setMinutes(gameStartTime.getMinutes() + this.settings.timeBetweenGames / MINUTE);
        }

        const newGame = new Game({
            number: this.gameNumber,
            time: gameStartTime,
            duration: duration,
            status: 'Scheduled',
            opponents: opponents,
            goals: [0, 0],
            gamePhase: gamePhase,
            gameDisplayName: displayName,
            finalPlacement: finalPlacement,
            matchId: matchId
        });

        await newGame.save();

        this.currentTime = new Date(gameStartTime.getTime() + duration * MINUTE);
        this.gameNumber++;
        return newGame;
    }

    getCurrentEndTime() {
        const lastGame = new Date(this.currentTime);
        lastGame.setMinutes(lastGame.getMinutes() + this.settings.gameDurationFinal / MINUTE);
        return lastGame;
    }

    // Belegt Platzhalter-Spiele neu, sobald die benötigten Ergebnisse vorliegen (Gruppenplätze, Sieger, Pools,
    // Gesamtwertung, Gegnertausch). Gibt die Anzahl aktualisierter Spiele zurück.
    // Verlangt das Template manuelle Entscheidungen, werden diese als offene Anfragen gespeichert und die betroffenen
    // Spiele bleiben unbelegt. Mit autoResolve (nur für Tests/Autoplay) wird jeweils die erste Option gewählt.
    async updateSchedule({ autoResolve = false } = {}) {
        try {
            const teams = await Team.find({}).exec();
            const games = await Game.find({}).lean().exec();
            let decisions = await getAllDecisions();
            let plan = rules.computeSchedulePlan(this.config, teams, games, decisions);
            for (let pass = 0; pass < 20; pass++) {
                const resolvedAny = await syncDecisions(plan.requests, { autoResolve });
                if (!autoResolve || !resolvedAny || !plan.requests.length) break;
                decisions = await getAllDecisions();
                plan = rules.computeSchedulePlan(this.config, teams, games, decisions);
            }
            for (const u of plan.updates) {
                await Game.updateOne({ _id: u.gameId }, { $set: { opponents: u.opponents } });
            }
            return plan.updates.length;
        } catch (error) {
            console.error('Error updating schedule:', error);
            return 0;
        }
    }
}

module.exports = { ScheduleGenerator };
