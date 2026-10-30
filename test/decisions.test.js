const assert = require("assert");
const env = require("./helpers/testEnv");
const { ScheduleGenerator } = require("../src/controllers/ScheduleGenerator");

const { Game, Team, Decision } = env;

describe("Manual decisions (swap and ties)", function () {
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

  async function setup(template, groups) {
    await env.resetDb();
    const settings = await env.seedSettings({ scheduleTemplate: template });
    await env.seedCounters(settings.goalsforSekt);
    await env.seedTeams(groups);
    const result = await ScheduleGenerator.fromSettings(settings).generateFullSchedule();
    assert.strictEqual(result.success, true, result.error);
  }

  const playable = g => g.status === "Scheduled" && g.opponents.every(o => !env.isDummyOpponent(o));

  // Plays every game that is currently playable; returns number of games played
  async function playAvailable() {
    let played = 0;
    for (;;) {
      const games = await Game.find({}).sort({ number: 1 });
      const next = games.find(g => playable(g) && !g.blocked);
      if (!next) return played;
      const res = await app.start(next._id);
      if (res.status === 409) return played;
      assert.strictEqual(res.status, 200);
      // home team wins by index, knockout games need a winner
      await app.score(next._id, 1, 1);
      await app.end(next._id);
      played++;
    }
  }

  async function resolveTies() {
    for (const d of await app.pendingDecisions()) {
      if (d.type !== "tie_break") continue;
      const res = await app.resolveDecision(d.key, d.options[0].id);
      assert.strictEqual((await res.json()).success, true);
    }
  }

  async function playUntilSwap() {
    for (let i = 0; i < 30; i++) {
      await playAvailable();
      const pending = await app.pendingDecisions();
      const swap = pending.find(d => d.type === "opponent_swap");
      if (swap) return swap;
      if (!pending.length) return null;
      await resolveTies();
    }
    return null;
  }

  it("a template with manual_confirmation asks before swapping and blocks the affected games", async function () {
    await setup("4groups_4teams_v4.yaml", ["A", "B", "C", "D"]);
    const swap = await playUntilSwap();
    assert.ok(swap, "expected a pending swap decision");
    assert.deepStrictEqual(swap.options.map(o => o.id).sort(), ["keep", "swap"]);
    assert.ok(swap.description.length > 10);
    assert.ok(swap.details.original.length > 0);
    assert.ok(swap.details.swapped.length > 0);

    const blocked = await Game.findOne({ matchId: { $in: swap.blocksMatches } });
    assert.ok(blocked);
    assert.ok(env.isDummyOpponent(blocked.opponents[0]) || env.isDummyOpponent(blocked.opponents[1]));
    const res = await app.start(blocked._id);
    assert.strictEqual(res.status, 409);

    // "ignore" = just reload: decision is still pending and games stay blocked
    const again = await app.pendingDecisions();
    assert.ok(again.some(d => d.key === swap.key));
    assert.strictEqual((await app.start(blocked._id)).status, 409);
  });

  for (const choice of ["swap", "keep"]) {
    it(`resolving with "${choice}" fills the games and unblocks them`, async function () {
      await setup("4groups_4teams_v4.yaml", ["A", "B", "C", "D"]);
      const swap = await playUntilSwap();
      assert.ok(swap);
      const res = await app.resolveDecision(swap.key, choice);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.ok(!body.pending.some(d => d.key === swap.key));

      const games = await Game.find({ matchId: { $in: swap.blocksMatches } }).lean();
      const byId = Object.fromEntries((await Team.find({})).map(t => [String(t._id), t]));
      games.forEach(g => {
        assert.ok(g.opponents.every(o => !env.isDummyOpponent(o)), `${g.matchId} still has placeholders`);
        const [a, b] = g.opponents.map(o => byId[String(o)]);
        if (choice === "swap") assert.notStrictEqual(a.group, b.group, `${g.matchId}`);
      });
      if (choice === "keep") {
        const expected = swap.details.original.map(m => [m.home.name, m.away.name].sort().join("|")).sort();
        const actual = games.map(g => g.opponents.map(o => byId[String(o)].name).sort().join("|")).sort();
        assert.deepStrictEqual(actual, expected);
      } else {
        const expected = swap.details.swapped.map(m => [m.home.name, m.away.name].sort().join("|")).sort();
        const actual = games.map(g => g.opponents.map(o => byId[String(o)].name).sort().join("|")).sort();
        assert.deepStrictEqual(actual, expected);
      }
      assert.strictEqual((await app.start(games[0]._id)).status, 200);
    });
  }

  it("resolving an unknown decision or option is rejected", async function () {
    await setup("4groups_4teams_v4.yaml", ["A", "B", "C", "D"]);
    const swap = await playUntilSwap();
    assert.ok(swap);
    const bad = await app.resolveDecision(swap.key, "nonsense");
    assert.notStrictEqual((await bad.json()).success, true);
    const unknown = await app.resolveDecision("swap:doesNotExist", "swap");
    assert.notStrictEqual((await unknown.json()).success, true);
    assert.ok((await app.pendingDecisions()).some(d => d.key === swap.key));
  });

  it("without manual_confirmation the swap happens automatically", async function () {
    await setup("2groups_4teams_small.yaml", ["A", "B"]);
    for (let i = 0; i < 10; i++) {
      await playAvailable();
      await resolveTies();
    }
    assert.strictEqual(await Decision.countDocuments({ type: "opponent_swap" }), 0);
  });

  it("a full tie in a group asks for a manual order and blocks dependent games", async function () {
    await setup("2groups_4teams_small.yaml", ["A", "B"]);
    // every group game 1:1 => all teams of a group are completely level
    const group = await Game.find({ gamePhase: "Group_Stage" }).sort({ number: 1 });
    for (const g of group) await app.play(g, [1, 1]);
    const pending = await app.pendingDecisions();
    const ties = pending.filter(d => d.type === "tie_break");
    assert.ok(ties.length > 0, "expected tie decisions");
    const tie = ties[0];
    const dependent = await Game.find({ matchId: { $exists: true, $ne: null }, status: "Scheduled" });
    const withDummy = dependent.filter(g => g.opponents.some(o => env.isDummyOpponent(o)));
    assert.ok(withDummy.length > 0, "dependent games stay placeholders");

    const ids = tie.options[tie.options.length - 1].id;
    const res = await app.resolveDecision(tie.key, ids);
    assert.strictEqual((await res.json()).success, true);
    assert.ok(!(await app.pendingDecisions()).some(d => d.key === tie.key));
  });

  it("autoplay resolves decisions automatically", async function () {
    await setup("4groups_4teams_v4.yaml", ["A", "B", "C", "D"]);
    const res = await app.autoPlay(200);
    assert.strictEqual(res.status, 200);
    const games = await Game.find({}).lean();
    assert.ok(games.every(g => g.status === "Ended"));
    assert.strictEqual((await app.pendingDecisions()).length, 0);
  });
});
