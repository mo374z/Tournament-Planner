const assert = require("assert");
const env = require("./helpers/testEnv");
const { ScheduleGenerator } = require("../src/controllers/ScheduleGenerator");

const { Game, Team, Counters } = env;

async function generate(settings) {
  const result = await new ScheduleGenerator(env.loadTemplate(), settings).generateFullSchedule();
  assert.strictEqual(result.success, true, result.error);
}

const winnerOf = g => (g.goals[0] > g.goals[1] ? g.opponents[0] : g.opponents[1]);
const loserOf = g => (g.goals[0] > g.goals[1] ? g.opponents[1] : g.opponents[0]);

// Deterministic result: group games -> lower team name wins 2:1 (every 5th game is a 1:1 draw),
// knockout games -> alternating winner so that both "opponent 1 wins" and "opponent 2 wins" are covered
function scoreFor(game, teamNames) {
  if (game.gamePhase === "Group_Stage") {
    if (game.number % 5 === 0) return [1, 1];
    return teamNames[0] < teamNames[1] ? [2, 1] : [1, 2];
  }
  return game.number % 2 === 0 ? [3, 1] : [0, 2];
}

describe("Full tournament flow (4groups_4teams) via GameController", function () {
  this.timeout(120000);

  let app;
  let all;
  let teamById;

  before(async function () {
    await env.connect();
    app = await env.startGameApp();
    await env.resetDb();
    const settings = await env.seedSettings();
    await env.seedCounters(settings.goalsforSekt);
    await env.seedTeams();
    await generate(settings);

    // Play strictly in schedule order like the operator does
    for (let n = 1; n <= 38; n++) {
      await app.resolveAll();
      const game = await Game.findOne({ number: n });
      assert.ok(
        game.opponents.every(o => !env.isDummyOpponent(o)),
        `game ${n} (${game.gamePhase}) still has placeholder opponents when it is due to be played`
      );
      const teams = await Promise.all(game.opponents.map(id => Team.findById(id)));
      await app.play(game, scoreFor(game, teams.map(t => t.name)));
    }

    all = await Game.find({}).sort({ number: 1 });
    teamById = Object.fromEntries((await Team.find({})).map(t => [String(t._id), t]));
  });

  after(async function () {
    await app.close();
    await env.resetDb();
    await env.disconnect();
  });

  const phase = id => all.find(g => g.matchId === id);
  const nameOf = id => teamById[String(id)].name;

  it("ends all 38 games", function () {
    assert.strictEqual(all.length, 38);
    all.forEach(g => assert.strictEqual(g.status, "Ended", `game ${g.number}`));
    return Counters.findOne({}).then(c => assert.strictEqual(c.gamesPlayed, 38));
  });

  it("group tables add up (points, games, goals)", function () {
    const groupGames = all.filter(g => g.gamePhase === "Group_Stage");
    const expected = {};
    for (const g of groupGames) {
      for (const [i, id] of g.opponents.entries()) {
        const e = (expected[id] ||= { points: 0, played: 0, gf: 0, ga: 0 });
        e.played++;
        e.gf += g.goals[i];
        e.ga += g.goals[1 - i];
        e.points += g.goals[i] > g.goals[1 - i] ? 3 : g.goals[i] === g.goals[1 - i] ? 1 : 0;
      }
    }
    for (const [id, e] of Object.entries(expected)) {
      const t = teamById[id];
      assert.strictEqual(t.points_Group_Stage, e.points, `${t.name} group points`);
      assert.strictEqual(t.gamesPlayed_Group_Stage, e.played, `${t.name} group games`);
      assert.deepStrictEqual(t.goalsGroupStage, [e.gf, e.ga], `${t.name} group goals`);
    }
  });

  it("every team's gamesPlayed equals won + draw + lost and matches its games", function () {
    for (const t of Object.values(teamById)) {
      assert.strictEqual(t.gamesPlayed, t.gamesWon + t.gamesDraw + t.gamesLost, t.name);
      const played = all.filter(g => g.opponents.map(String).includes(String(t._id))).length;
      assert.strictEqual(t.gamesPlayed, played, t.name);
    }
  });

  it("quarterfinals contain group winners/runners-up per template", function () {
    const rank = group => {
      // same order as the app: points, goal difference, goals scored
      return Object.values(teamById)
        .filter(t => t.group === group)
        .sort((a, b) => b.points_Group_Stage - a.points_Group_Stage ||
          (b.goalsGroupStage[0] - b.goalsGroupStage[1]) - (a.goalsGroupStage[0] - a.goalsGroupStage[1]) ||
          b.goalsGroupStage[0] - a.goalsGroupStage[0]);
    };
    const ranks = Object.fromEntries(["A", "B", "C", "D"].map(g => [g, rank(g)]));
    const matchups = [
      [["A", 1], ["D", 2]],
      [["B", 1], ["C", 2]],
      [["C", 1], ["B", 2]],
      [["D", 1], ["A", 2]],
    ];
    matchups.forEach(([[g1, p1], [g2, p2]], i) => {
      const qf = phase(`QF${i + 1}`);
      assert.deepStrictEqual(qf.opponents.map(String), [String(ranks[g1][p1 - 1]._id), String(ranks[g2][p2 - 1]._id)]);
    });
  });

  it("semifinals are filled with quarterfinal winners (QF1/QF3 and QF2/QF4)", function () {
    const qf = n => phase(`QF${n}`);
    assert.deepStrictEqual(phase("SF1").opponents.map(String), [winnerOf(qf(1)), winnerOf(qf(3))].map(String));
    assert.deepStrictEqual(phase("SF2").opponents.map(String), [winnerOf(qf(2)), winnerOf(qf(4))].map(String));
  });

  it("final = semifinal winners, bronze match = semifinal losers", function () {
    const sf1 = phase("SF1");
    const sf2 = phase("SF2");
    assert.deepStrictEqual(phase("FINAL").opponents.map(String), [winnerOf(sf1), winnerOf(sf2)].map(String));
    assert.deepStrictEqual(phase("BRONZE").opponents.map(String), [loserOf(sf1), loserOf(sf2)].map(String));
  });

  it("5th/7th place matches are played between the quarterfinal losers", function () {
    const losers = [1, 2, 3, 4].map(n => String(loserOf(phase(`QF${n}`))));
    const placed = [...phase("P5").opponents, ...phase("P7").opponents].map(String);
    assert.deepStrictEqual([...placed].sort(), [...losers].sort());
  });

  it("no team plays twice in the same knockout round and no team is a placeholder", function () {
    for (const g of all) {
      assert.ok(g.opponents.every(o => !env.isDummyOpponent(o)), `game ${g.number}`);
      assert.notStrictEqual(String(g.opponents[0]), String(g.opponents[1]), `game ${g.number} plays against itself`);
    }
    for (const prefix of ["Quarterfinals", "Semifinals"]) {
      const ids = all.filter(g => g.gamePhase.startsWith(prefix)).flatMap(g => g.opponents.map(String));
      assert.strictEqual(new Set(ids).size, ids.length, prefix);
    }
  });

  it("assigns every team a unique final placement 1..16", function () {
    const placements = Object.values(teamById).map(t => t.finalPlacement);
    assert.ok(placements.every(p => p != null), "all teams have a final placement: " + JSON.stringify(placements));
    assert.deepStrictEqual([...placements].sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it("final winner is rank 1, final loser rank 2, bronze winner rank 3", function () {
    const final = phase("FINAL");
    const bronze = phase("BRONZE");
    assert.strictEqual(teamById[String(winnerOf(final))].finalPlacement, 1);
    assert.strictEqual(teamById[String(loserOf(final))].finalPlacement, 2);
    assert.strictEqual(teamById[String(winnerOf(bronze))].finalPlacement, 3);
    assert.strictEqual(teamById[String(loserOf(bronze))].finalPlacement, 4);
  });

  it("goal counters match the sum of all goals", async function () {
    const total = all.reduce((s, g) => s + g.goals[0] + g.goals[1], 0);
    const counters = await Counters.findOne({});
    assert.strictEqual(counters.allGoals, total);
    const logged = all.reduce((s, g) => s + g.goalsLog.length, 0);
    assert.strictEqual(logged, total);
  });

  it("debug helper: prints the final ranking", function () {
    if (!process.env.SHOW_RANKING) return this.skip();
    Object.values(teamById)
      .sort((a, b) => a.finalPlacement - b.finalPlacement)
      .forEach(t => console.log(t.finalPlacement, t.name, nameOf(t._id)));
  });
});

describe("GameController: autoPlayGames endpoint", function () {
  this.timeout(120000);
  let app;

  before(async function () {
    await env.connect();
    app = await env.startGameApp();
  });

  after(async function () {
    await app.close();
    await env.resetDb();
    await env.disconnect();
  });

  it("plays all games up to the limit without leaving placeholders behind", async function () {
    await env.resetDb();
    const settings = await env.seedSettings();
    await env.seedCounters(settings.goalsforSekt);
    await env.seedTeams();
    await generate(settings);

    const res = await app.autoPlay(38);
    assert.strictEqual(res.status, 200);

    const ended = await Game.countDocuments({ status: "Ended" });
    assert.strictEqual(ended, 38);
    for (const g of await Game.find({})) {
      assert.ok(g.opponents.every(o => !env.isDummyOpponent(o)), `game ${g.number} still has placeholders`);
    }
    const unique = new Set((await Team.find({})).map(t => t.finalPlacement));
    assert.strictEqual(unique.size, 16, "unique final placements");
  });
});
