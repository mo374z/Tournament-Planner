const assert = require("assert");
const env = require("./helpers/testEnv");
const { ScheduleGenerator } = require("../src/controllers/ScheduleGenerator");
const { listTemplates, loadTemplate, validateTemplate } = require("../src/services/tournamentTemplate");
const rules = require("../src/services/tournamentRules");

const { Game, Team } = env;

describe("Schedule templates (pure)", function () {
  it("lists all shipped templates with name and description, all valid", function () {
    const list = listTemplates();
    const files = list.map(t => t.file);
    for (const f of ["4groups_4teams.yaml", "4groups_4teams_v3.yaml", "4groups_4teams_v4.yaml", "2groups_4teams_small.yaml", "3groups_4teams_12.yaml"]) {
      assert.ok(files.includes(f), `${f} missing`);
    }
    for (const t of list) {
      assert.ok(t.name && t.description.length > 20, `${t.file} needs name and description`);
      assert.strictEqual(t.valid, true, `${t.file} should be valid`);
    }
  });

  it("rejects broken templates with readable errors", function () {
    const t = loadTemplate("4groups_4teams_v4.yaml");
    t.meta.total_teams = 15;
    t.knockout_stage.phases[1].matches[0].home = { type: "winner", match: "NOPE" };
    t.knockout_stage.phases[2].matches[0].final_placement = 11;
    const errors = validateTemplate(t).join("\n");
    assert.match(errors, /total_teams/);
    assert.match(errors, /NOPE/);
    assert.match(errors, /final_placement/);
  });

  it("refuses path tricks when loading a template", function () {
    assert.throws(() => loadTemplate("../../package.json"));
  });

  it("round robin: every pair once, also for odd team counts and two legs", function () {
    for (const n of [2, 3, 4, 5, 6]) {
      const pairs = new Map();
      for (const round of rules.buildRoundRobin(n, 1)) {
        const inRound = round.flat();
        assert.strictEqual(new Set(inRound).size, inRound.length);
        for (const [h, a] of round) pairs.set([h, a].sort().join("-"), (pairs.get([h, a].sort().join("-")) || 0) + 1);
      }
      assert.strictEqual(pairs.size, (n * (n - 1)) / 2, `n=${n}`);
      [...pairs.values()].forEach(c => assert.strictEqual(c, 1));
    }
    const two = rules.buildRoundRobin(4, 2).flat();
    assert.strictEqual(two.length, 12);
    const [h, a] = rules.buildRoundRobin(4, 1)[0][0];
    assert.deepStrictEqual(rules.buildRoundRobin(4, 2)[3][0], [a, h]);
  });

  it("minimalSwap removes same-group pairings with as little movement as possible", function () {
    const t = (name, group) => ({ _id: name, name, group });
    const input = [t("a1", "A"), t("a2", "A"), t("b1", "B"), t("b2", "B"), t("c1", "C"), t("c2", "C"), t("d1", "D"), t("d2", "D")];
    const out = rules.minimalSwap(input);
    for (let i = 0; i < out.length; i += 2) assert.notStrictEqual(out[i].group, out[i + 1].group);
    assert.deepStrictEqual(out.map(x => x.name).sort(), input.map(x => x.name).sort());
    // already conflict free -> unchanged
    const ok = [t("a1", "A"), t("b1", "B")];
    assert.strictEqual(rules.minimalSwap(ok), ok);
  });

  it("sortTeams uses head to head for teams that are level on the earlier criteria", function () {
    const mk = (n, id) => ({ _id: id, name: n });
    const [x, y] = [mk("X", "1"), mk("Y", "2")];
    const stats = () => ({ pts: 3, gf: 2, ga: 2, ptsGen: 3, gfGen: 2, gaGen: 2 });
    const games = [{ status: "Ended", opponents: ["1", "2"], goals: [0, 1], gamePhase: "Group_Stage" }];
    const sorted = rules.sortTeams([x, y], ["points", "goal_difference", "head_to_head"], stats, games);
    assert.deepStrictEqual(sorted.map(t => t.name), ["Y", "X"]);
  });
});

const CASES = [
  { file: "4groups_4teams.yaml", groups: ["A", "B", "C", "D"], games: 38, lastMatch: "FINAL", swap: false },
  { file: "4groups_4teams_v3.yaml", groups: ["A", "B", "C", "D"], games: 38, lastMatch: "P15", swap: false },
  { file: "4groups_4teams_v4.yaml", groups: ["A", "B", "C", "D"], games: 38, lastMatch: "P15", swap: true },
  { file: "2groups_4teams_small.yaml", groups: ["A", "B"], games: 18, lastMatch: "FINAL", swap: true },
  { file: "3groups_4teams_12.yaml", groups: ["A", "B", "C"], games: 30, lastMatch: "FINAL", swap: true },
];

for (const c of CASES) {
  describe(`Full tournament with ${c.file}`, function () {
    this.timeout(120000);
    let app;
    let all;
    let teams;

    before(async function () {
      await env.connect();
      app = await env.startGameApp();
      await env.resetDb();
      const settings = await env.seedSettings({ scheduleTemplate: c.file });
      await env.seedCounters(settings.goalsforSekt);
      teams = await env.seedTeams(c.groups);
      const result = await ScheduleGenerator.fromSettings(settings).generateFullSchedule();
      assert.strictEqual(result.success, true, result.error);
      all = await Game.find({}).sort({ number: 1 }).lean();
    });

    after(async function () {
      await app.close();
      await env.resetDb();
      await env.disconnect();
    });

    it("generates the expected number of games and ends with the expected game", function () {
      assert.strictEqual(all.length, c.games);
      assert.strictEqual(all[all.length - 1].matchId, c.lastMatch);
    });

    it("plays through (autoplay) with unique final placements and no placeholders left", async function () {
      const res = await app.autoPlay(200);
      assert.strictEqual(res.status, 200);
      const games = await Game.find({}).sort({ number: 1 }).lean();
      games.forEach(g => {
        assert.strictEqual(g.status, "Ended", `game ${g.number} ${g.matchId || g.gamePhase}`);
        assert.ok(g.opponents.every(o => !env.isDummyOpponent(o)), `game ${g.number} has placeholders`);
        if (g.matchId) assert.notStrictEqual(g.goals[0], g.goals[1], `knockout game ${g.number} ended in a draw`);
      });
      const placements = (await Team.find({})).map(t => t.finalPlacement).sort((a, b) => a - b);
      assert.deepStrictEqual(placements, Array.from({ length: teams.length }, (_, i) => i + 1));
    });

    if (c.swap) {
      it("opponent swap: no placement game pairs two teams of the same group", async function () {
        const byId = Object.fromEntries((await Team.find({})).map(t => [String(t._id), t]));
        const games = await Game.find({ matchId: /^P\d+$/ }).lean();
        assert.ok(games.length > 0);
        for (const g of games) {
          const [a, b] = g.opponents.map(o => byId[String(o)]);
          assert.notStrictEqual(a.group, b.group, `${g.matchId}: ${a.name} vs ${b.name}`);
        }
      });
    }
  });
}

describe("GameController uses the template rules", function () {
  this.timeout(60000);
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

  it("refuses to end a knockout game with a draw when the template requires a winner", async function () {
    await setup("4groups_4teams_v3.yaml", ["A", "B", "C", "D"]);
    const group = await Game.find({ gamePhase: "Group_Stage" }).sort({ number: 1 });
    for (const g of group) await app.play(g, [2, 1]);
    await app.resolveAll();
    const qf = await Game.findOne({ matchId: "QF1" });
    assert.ok(qf.opponents.every(o => !env.isDummyOpponent(o)));
    await app.start(qf._id);
    await app.score(qf._id, 1, 1);
    await app.score(qf._id, 2, 1);
    const res = await app.end(qf._id);
    assert.strictEqual(res.status, 302);
    assert.match(res.headers.get("location"), /error=draw/);
    assert.strictEqual((await Game.findById(qf._id)).status, "active");
    await app.score(qf._id, 1, 1);
    await app.end(qf._id);
    assert.strictEqual((await Game.findById(qf._id)).status, "Ended");
  });

  it("fills semifinals only once both quarterfinals are finished", async function () {
    await setup("4groups_4teams_v3.yaml", ["A", "B", "C", "D"]);
    const group = await Game.find({ gamePhase: "Group_Stage" }).sort({ number: 1 });
    for (const g of group) await app.play(g, [2, 1]);
    await app.resolveAll();
    await app.play(await Game.findOne({ matchId: "QF1" }), [2, 0]);
    let sf1 = await Game.findOne({ matchId: "SF1" });
    assert.ok(env.isDummyOpponent(sf1.opponents[1]), "QF3 not played yet");
    await app.play(await Game.findOne({ matchId: "QF3" }), [0, 1]);
    sf1 = await Game.findOne({ matchId: "SF1" });
    assert.ok(sf1.opponents.every(o => !env.isDummyOpponent(o)));
  });

  it("generating with a wrong team count reports an error", async function () {
    await env.resetDb();
    const settings = await env.seedSettings({ scheduleTemplate: "2groups_4teams_small.yaml" });
    await env.seedTeams(["A", "B", "C", "D"]);
    const result = await ScheduleGenerator.fromSettings(settings).generateFullSchedule();
    assert.strictEqual(result.success, false);
    assert.match(result.error, /erwartet 16 Teams in 2 Gruppen|erwartet 8 Teams in 2 Gruppen/);
    assert.match(result.error, /zu viele/);
  });
});
