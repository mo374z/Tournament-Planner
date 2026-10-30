const assert = require("assert");
const env = require("./helpers/testEnv");
const { ScheduleGenerator } = require("../src/controllers/ScheduleGenerator");
const rules = require("../src/services/tournamentRules");

const { Game, Team, MIN } = env;

describe("ScheduleGenerator.generateFullSchedule (4groups_4teams)", function () {
  let settings;
  let teams;
  let games;

  before(async function () {
    await env.connect();
    await env.resetDb();
    settings = await env.seedSettings();
    teams = await env.seedTeams();
    const result = await new ScheduleGenerator(env.loadTemplate(), settings).generateFullSchedule();
    assert.strictEqual(result.success, true, result.error);
    games = await Game.find({}).sort({ number: 1 }).lean();
  });

  after(async function () {
    await env.resetDb();
    await env.disconnect();
  });

  const byPhase = prefix => games.filter(g => g.gamePhase.startsWith(prefix));
  const teamName = id => teams.find(t => String(t._id) === String(id)).name;

  it("creates 38 consecutively numbered games, all Scheduled with 0:0", function () {
    assert.strictEqual(games.length, 38);
    games.forEach((g, i) => {
      assert.strictEqual(g.number, i + 1);
      assert.strictEqual(g.status, "Scheduled");
      assert.deepStrictEqual(g.goals, [0, 0]);
    });
  });

  it("orders phases: group stage, quarterfinals, semifinals, finals", function () {
    const phases = games.map(g => g.gamePhase.split(" ")[0]);
    const expected = [
      ...Array(24).fill("Group_Stage"),
      ...Array(4).fill("Quarterfinals"),
      ...Array(2).fill("Semifinals"),
      ...Array(8).fill("Finals"),
    ];
    assert.deepStrictEqual(phases, expected);
  });

  describe("group stage", function () {
    it("has 6 games per group, every pair exactly once", function () {
      const groupGames = byPhase("Group_Stage");
      const pairs = new Map();
      for (const g of groupGames) {
        const [a, b] = g.opponents.map(teamName);
        assert.strictEqual(a[0], b[0], `${a} vs ${b} are from different groups`);
        const key = [a, b].sort().join("-");
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
      assert.strictEqual(pairs.size, 24);
      for (const [key, count] of pairs) assert.strictEqual(count, 1, `${key} scheduled ${count}x`);
    });

    it("lets every team play exactly 3 group games", function () {
      const counts = {};
      for (const g of byPhase("Group_Stage")) for (const id of g.opponents) counts[id] = (counts[id] || 0) + 1;
      assert.strictEqual(Object.keys(counts).length, 16);
      Object.values(counts).forEach(c => assert.strictEqual(c, 3));
    });

    it("never lets a team play twice in a row inside the same round block of 4 games", function () {
      const groupGames = byPhase("Group_Stage");
      for (let round = 0; round < 6; round++) {
        const block = groupGames.slice(round * 4, round * 4 + 4);
        const ids = block.flatMap(g => g.opponents.map(String));
        assert.strictEqual(new Set(ids).size, 8, `round block ${round + 1} contains duplicate teams`);
      }
    });

    it("uses the display name and duration from template/settings", function () {
      for (const g of byPhase("Group_Stage")) {
        assert.strictEqual(g.gameDisplayName, "Gruppenspiel");
        assert.strictEqual(Number(g.duration), 10);
      }
    });
  });

  describe("knockout placeholders", function () {
    it("creates quarterfinals following the template matchups", function () {
      const qf = byPhase("Quarterfinals");
      const expected = [
        ["1. aus Gruppe A", "2. aus Gruppe D"],
        ["1. aus Gruppe B", "2. aus Gruppe C"],
        ["1. aus Gruppe C", "2. aus Gruppe B"],
        ["1. aus Gruppe D", "2. aus Gruppe A"],
      ];
      assert.deepStrictEqual(qf.map(g => g.gamePhase), ["Quarterfinals 1", "Quarterfinals 2", "Quarterfinals 3", "Quarterfinals 4"]);
      assert.deepStrictEqual(qf.map(g => g.opponents.map(o => o.name)), expected);
      qf.forEach(g => {
        assert.ok(g.opponents.every(env.isDummyOpponent));
        assert.strictEqual(Number(g.duration), 12);
        assert.ok(g.gameDisplayName.startsWith("Viertelfinale"));
      });
    });

    it("creates semifinals fed by quarterfinals 1/3 and 2/4", function () {
      const sf = byPhase("Semifinals");
      assert.deepStrictEqual(sf.map(g => g.opponents.map(o => o.name)), [
        ["Sieger Viertelfinale 1", "Sieger Viertelfinale 3"],
        ["Sieger Viertelfinale 2", "Sieger Viertelfinale 4"],
      ]);
      sf.forEach(g => assert.strictEqual(Number(g.duration), 15));
    });

    it("creates placement, bronze, last-place and final games with the right placements", function () {
      const finals = games.slice(30).map(g => [g.matchId, g.gamePhase, g.finalPlacement, g.gameDisplayName]);
      assert.deepStrictEqual(finals, [
        ["P13", "Finals 1", 13, "Platzierungsspiel 13-14"],
        ["P11", "Finals 2", 11, "Platzierungsspiel 11-12"],
        ["P9", "Finals 3", 9, "Platzierungsspiel 9-10"],
        ["P7", "Finals 4", 7, "Platzierungsspiel 7-8"],
        ["P5", "Finals 5", 5, "Platzierungsspiel 5-6"],
        ["BRONZE", "Finals 6", 3, "Spiel um Platz 3"],
        ["P15", "Finals 7", 15, "Spiel um letzten Platz"],
        ["FINAL", "Finals 8", 1, "Finale"],
      ]);
      games.slice(30).forEach(g => assert.strictEqual(Number(g.duration), 20));
    });
  });

  describe("timing", function () {
    it("never overlaps games and keeps at least timeBetweenGames in between", function () {
      for (let i = 1; i < games.length; i++) {
        const prevEnd = games[i - 1].time.getTime() + Number(games[i - 1].duration) * MIN;
        const gap = games[i].time.getTime() - prevEnd;
        assert.ok(gap >= settings.timeBetweenGames, `gap before game ${games[i].number} is ${gap / MIN} min`);
      }
    });

    it("has exactly timeBetweenGames between games inside one phase", function () {
      for (let i = 1; i < 24; i++) {
        const prevEnd = games[i - 1].time.getTime() + Number(games[i - 1].duration) * MIN;
        assert.strictEqual(games[i].time.getTime() - prevEnd, settings.timeBetweenGames);
      }
    });

    it("first game starts exactly at TornamentStartTime", function () {
      assert.strictEqual(games[0].time.getTime(), settings.TornamentStartTime.getTime());
    });

    it("start time input is interpreted in the tournament time zone", function () {
      const { parseLocalInput, formatLocalInput } = require("../src/services/timezone");
      assert.strictEqual(parseLocalInput("2026-01-17T08:00").toISOString(), "2026-01-17T07:00:00.000Z");
      assert.strictEqual(parseLocalInput("2026-07-17T08:00").toISOString(), "2026-07-17T06:00:00.000Z");
      assert.strictEqual(formatLocalInput(new Date("2026-07-17T06:00:00.000Z")), "2026-07-17T08:00");
    });
  });

  it("regenerating replaces the old schedule instead of appending", async function () {
    await new ScheduleGenerator(env.loadTemplate(), settings).generateFullSchedule();
    assert.strictEqual(await Game.countDocuments({}), 38);
  });

  describe("template driven", function () {
    const small = () => env.loadTemplate("2groups_4teams_small.yaml");
    const gen = async (template, groupSizes) => {
      await env.resetDb();
      const s = await env.seedSettings();
      const docs = [];
      for (const [g, n] of Object.entries(groupSizes)) for (let i = 1; i <= n; i++) docs.push(env.teamDoc(`${g}${i}`, g));
      await Team.insertMany(docs);
      const result = await new ScheduleGenerator(template, s).generateFullSchedule();
      return { result, games: await Game.find({}).sort({ number: 1 }).lean() };
    };

    it("honours group_stage.groups with different group sizes / count (odd group, two legs)", async function () {
      const t = small();
      t.group_stage.groups = [{ name: "A", teams: 3 }, { name: "B", teams: 5 }];
      t.group_stage.format.legs = 2;
      t.knockout_stage.phases = t.knockout_stage.phases.filter(p => p.id === "semifinals");
      t.knockout_stage.phases[0].matches.forEach(m => { m.home = { type: "team", name: "A1" }; m.away = { type: "team", name: "B1" }; });
      t.opponent_swap.enabled = false;
      const { result, games } = await gen(t, { A: 3, B: 5 });
      assert.strictEqual(result.success, true, result.error);
      assert.strictEqual(games.filter(g => g.gamePhase === "Group_Stage").length, 6 + 20);
      assert.strictEqual(games.length, 26 + 2);
    });

    it("honours advancement.spots_per_group", async function () {
      const t = small();
      t.group_stage.advancement.spots_per_group = 1;
      t.group_stage.ranking.final_tiebreak = "alphabetical";
      const { result, games } = await gen(t, { A: 4, B: 4 });
      assert.strictEqual(result.success, true, result.error);
      const teams = await Team.find({});
      // Group games all ended: A1/B1 win everything, the rest is level -> only group winners qualify
      const rank = g => teams.filter(x => x.group === g);
      const ctxTeams = teams.map(x => x.toObject());
      const played = games.map(g => ({ ...g }));
      for (const g of played.filter(x => x.gamePhase === "Group_Stage")) {
        const [a, b] = g.opponents.map(o => ctxTeams.find(x => String(x._id) === String(o)).name);
        g.status = "Ended";
        g.goals = a < b ? [1, 0] : [0, 1];
      }
      const ctx = rules.buildContext(t, ctxTeams, played);
      assert.deepStrictEqual(ctx.overall.slice(0, 2).map(x => x.name).sort(), ["A1", "B1"]);
      assert.strictEqual(rank("A").length, 4);
    });

    it("honours tiebreakers incl. head_to_head", async function () {
      const t = small();
      t.group_stage.ranking.tiebreakers = ["points", "head_to_head"];
      const { games } = await gen(t, { A: 4, B: 4 });
      const teams = (await Team.find({})).map(x => x.toObject());
      const idByName = Object.fromEntries(teams.map(x => [x.name, String(x._id)]));
      // A1, A2, A3 level on points/goal difference/goals, A2 beat A1 head to head
      const results = { "A1-A2": [0, 1], "A1-A3": [2, 1], "A1-A4": [2, 1], "A2-A3": [2, 1], "A2-A4": [0, 1], "A3-A4": [3, 1] };
      const played = games.map(g => {
        if (g.gamePhase !== "Group_Stage") return g;
        const names = g.opponents.map(o => teams.find(x => String(x._id) === String(o)).name);
        const key = names.slice().sort().join("-");
        if (!(key in results)) return g;
        const [lo] = [key.split("-")[0]];
        const goals = names[0] === lo ? results[key] : results[key].slice().reverse();
        return { ...g, status: "Ended", goals };
      });
      const ctx = rules.buildContext(t, teams, played);
      const names = ctx.tables.A.map(x => x.name);
      assert.ok(idByName.A1);
      const pts = n => names.indexOf(n);
      assert.ok(pts("A2") < pts("A1"), `table: ${names}`);
    });

    it("supports disabling quarterfinals / placement matches without breaking later phases", async function () {
      const t = env.loadTemplate("4groups_4teams_v3.yaml");
      t.knockout_stage.phases.find(p => p.id === "quarterfinals").enabled = false;
      t.knockout_stage.phases = t.knockout_stage.phases.filter(p => p.id !== "quarterfinals");
      t.pools = {};
      const finals = t.knockout_stage.phases.find(p => p.id === "finals");
      finals.matches = finals.matches.filter(m => ["BRONZE", "FINAL"].includes(m.id));
      t.knockout_stage.phases[0].matches = [
        { id: "SF1", home: { type: "group_rank", group: "A", rank: 1 }, away: { type: "group_rank", group: "B", rank: 1 } },
        { id: "SF2", home: { type: "group_rank", group: "C", rank: 1 }, away: { type: "group_rank", group: "D", rank: 1 } },
      ];
      const { result, games } = await gen(t, { A: 4, B: 4, C: 4, D: 4 });
      assert.strictEqual(result.success, true, result.error);
      assert.strictEqual(games.length, 24 + 2 + 2);
    });

    it("does not assume groups A-D in placement matches", async function () {
      const t = small();
      t.group_stage.groups = [{ name: "X", teams: 4 }, { name: "Y", teams: 4 }];
      for (const p of t.knockout_stage.phases) {
        for (const m of p.matches) for (const s of [m.home, m.away]) if (s.group) s.group = s.group === "A" ? "X" : "Y";
      }
      const { result, games } = await gen(t, { X: 4, Y: 4 });
      assert.strictEqual(result.success, true, result.error);
      assert.strictEqual(games.find(g => g.matchId === "SF1").opponents[0].name, "1. aus Gruppe X");
    });
  });
});
