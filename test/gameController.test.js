const assert = require("assert");
const env = require("./helpers/testEnv");
const { ScheduleGenerator } = require("../src/controllers/ScheduleGenerator");

const { Game, Team, Counters } = env;

async function generate(settings) {
  const result = await new ScheduleGenerator(env.loadTemplate(), settings).generateFullSchedule();
  assert.strictEqual(result.success, true, result.error);
}

describe("GameController: single game behaviour", function () {
  let app;
  let settings;

  before(async function () {
    await env.connect();
    app = await env.startGameApp();
  });

  after(async function () {
    await app.close();
    await env.resetDb();
    await env.disconnect();
  });

  beforeEach(async function () {
    await env.resetDb();
    settings = await env.seedSettings({ goalsforSekt: 5 });
    await env.seedCounters(5);
    await env.seedTeams();
    await generate(settings);
  });

  const gameNo = n => Game.findOne({ number: n });

  it("start sets the game active and ends other active games", async function () {
    const g1 = await gameNo(1);
    const g2 = await gameNo(2);
    await app.start(g1._id);
    assert.strictEqual((await gameNo(1)).status, "active");
    await app.start(g2._id);
    assert.strictEqual((await gameNo(2)).status, "active");
    // existing behaviour: the previously active game gets the status "ENDE" (not "Ended")
    assert.strictEqual((await gameNo(1)).status, "ENDE");
  });

  it("change-score increments and decrements goals and logs them", async function () {
    const g = await gameNo(1);
    await app.start(g._id);
    await app.score(g._id, 1, 1);
    await app.score(g._id, 1, 1);
    await app.score(g._id, 2, 1);
    let fresh = await gameNo(1);
    assert.deepStrictEqual(fresh.goals, [2, 1]);
    assert.strictEqual(fresh.goalsLog.length, 3);
    assert.deepStrictEqual(fresh.goalsLog.map(l => l.goalIndex), [1, 2, 3]);

    await app.score(g._id, 1, -1);
    fresh = await gameNo(1);
    assert.deepStrictEqual(fresh.goals, [1, 1]);
    assert.strictEqual(fresh.goalsLog.length, 2);
  });

  it("does not decrement below 0 (HTTP 304)", async function () {
    const g = await gameNo(1);
    await app.start(g._id);
    const res = await app.score(g._id, 1, -1);
    assert.strictEqual(res.status, 304);
    assert.deepStrictEqual((await gameNo(1)).goals, [0, 0]);
  });

  it("counts the global goal counter and awards sekt after goalsforSekt goals", async function () {
    const g = await gameNo(1);
    await app.start(g._id);
    for (let i = 0; i < 5; i++) await app.score(g._id, 1, 1);
    const counters = await Counters.findOne({});
    assert.strictEqual(counters.allGoals, 5);
    assert.strictEqual(counters.goalSektCounter, 5, "counter is reset after the sekt was won");
    const log = (await gameNo(1)).goalsLog;
    assert.deepStrictEqual(log.map(l => l.sekt_won), [false, false, false, false, true]);

    const teamId = (await gameNo(1)).opponents[0];
    const team = await env.waitFor(async () => {
      const t = await Team.findById(teamId);
      return t.sektWon === 1 ? t : null;
    });
    assert.ok(team, "scoring team received the sekt");
    assert.strictEqual((await Counters.findOne({})).wonSektBottles, 1);
  });

  it("endGame: win gives 3 points, loser 0, goals are booked for both teams", async function () {
    const g = await gameNo(1);
    await app.play(g, [3, 1]);
    const fresh = await gameNo(1);
    assert.strictEqual(fresh.status, "Ended");
    const [t1, t2] = await Promise.all(fresh.opponents.map(id => Team.findById(id)));
    assert.deepStrictEqual([t1.gamesWon, t1.gamesLost, t1.gamesDraw, t1.points_Group_Stage, t1.points_General], [1, 0, 0, 3, 3]);
    assert.deepStrictEqual([t2.gamesWon, t2.gamesLost, t2.gamesDraw, t2.points_Group_Stage, t2.points_General], [0, 1, 0, 0, 0]);
    assert.deepStrictEqual(t1.goals, [3, 1]);
    assert.deepStrictEqual(t2.goals, [1, 3]);
    assert.deepStrictEqual(t1.goalsGroupStage, [3, 1]);
    assert.deepStrictEqual(t2.goalsGroupStage, [1, 3]);
    assert.strictEqual(t1.gamesPlayed_Group_Stage, 1);
    assert.strictEqual((await Counters.findOne({})).gamesPlayed, 1);
  });

  it("endGame: draw gives 1 point each", async function () {
    const g = await gameNo(1);
    await app.play(g, [2, 2]);
    const teams = await Promise.all((await gameNo(1)).opponents.map(id => Team.findById(id)));
    for (const t of teams) {
      assert.deepStrictEqual([t.gamesDraw, t.gamesWon, t.gamesLost, t.points_Group_Stage], [1, 0, 0, 1]);
    }
  });

  it("endGame on a game that is not active is a no-op", async function () {
    const g = await gameNo(1);
    await app.end(g._id);
    assert.strictEqual((await gameNo(1)).status, "Scheduled");
    assert.strictEqual((await Counters.findOne({})).gamesPlayed, 0);
  });

  it("endGame twice does not book the result twice", async function () {
    const g = await gameNo(1);
    await app.play(g, [1, 0]);
    await app.end(g._id);
    const winner = await Team.findById((await gameNo(1)).opponents[0]);
    assert.strictEqual(winner.gamesPlayed, 1);
    assert.strictEqual(winner.points_Group_Stage, 3);
    assert.strictEqual((await Counters.findOne({})).gamesPlayed, 1);
  });

  it("the last group game resolves the quarterfinal placeholders to real teams", async function () {
    // Play group games with deterministic results: the lower team number always wins 1:0
    const groupGames = await Game.find({ gamePhase: "Group_Stage" }).sort({ number: 1 });
    for (const g of groupGames) {
      const [a, b] = await Promise.all(g.opponents.map(id => Team.findById(id)));
      await app.play(g, a.name < b.name ? [1, 0] : [0, 1]);
    }
    const qf = await Game.find({ gamePhase: /^Quarterfinals/ }).sort({ number: 1 });
    const names = await Promise.all(qf.map(async g => (await Promise.all(g.opponents.map(id => Team.findById(id)))).map(t => t.name)));
    // 1st = X1, 2nd = X2 in every group
    assert.deepStrictEqual(names, [["A1", "D2"], ["B1", "C2"], ["C1", "B2"], ["D1", "A2"]]);
  });
});
