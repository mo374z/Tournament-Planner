const assert = require("assert");
const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const { allowInsecurePrototypeAccess } = require("@handlebars/allow-prototype-access");
const { summarize, gameWinner, formatPenaltyResult } = require("../src/services/penaltyShootout");
const { computeStats, buildContext } = require("../src/services/tournamentRules");
const env = require("./helpers/testEnv");

function shootout(starter, results, finished = false) {
  return {
    starter, finished, revision: 0,
    kicks: results.map((scored, index) => ({ team: (starter + index) % 2, scored })),
  };
}

describe("Penalty shootout rules", function () {
  it("uses the chosen starter, alternates teams and stops as soon as the result is unreachable", function () {
    const state = summarize(shootout(1, [true, false, true, false, true, false]));
    assert.deepStrictEqual(state.scores, [0, 3]);
    assert.strictEqual(state.winner, 1);
    assert.strictEqual(state.nextTeam, null);
    assert.strictEqual(summarize(shootout(1, [true])).nextTeam, 0);
  });

  it("waits for both teams in sudden death and supports more than five shots", function () {
    const firstFive = [true, true, true, true, true, true, true, true, true, true];
    assert.strictEqual(summarize(shootout(0, firstFive)).winner, null);
    assert.strictEqual(summarize(shootout(0, [...firstFive, true])).winner, null);
    const state = summarize(shootout(0, [...firstFive, true, false]));
    assert.deepStrictEqual(state.scores, [6, 5]);
    assert.strictEqual(state.winner, 0);
    assert.strictEqual(gameWinner({ goals: [1, 1], penaltyShootout: shootout(0, [...firstFive, true, false]) }), null);
    assert.strictEqual(gameWinner({ goals: [1, 1], penaltyShootout: shootout(0, [...firstFive, true, false], true) }), 0);
  });

  it("uses the shootout winner for knockout results but keeps group draws as draws", function () {
    const penaltyShootout = shootout(1, [true, false, true, false, true, false], true);
    const match = { matchId: "QF1", status: "Ended", opponents: ["a", "b"], goals: [1, 1], gamePhase: "KO", penaltyShootout };
    const stats = computeStats([match], "Group_Stage", { win: 3, draw: 1, loss: 0 });
    assert.strictEqual(stats("a").ptsGen, 0);
    assert.strictEqual(stats("b").ptsGen, 3);
    const groupStats = computeStats([{ ...match, gamePhase: "Group_Stage" }], "Group_Stage", { win: 3, draw: 1, loss: 0 });
    assert.strictEqual(groupStats("a").pts, 1);
    assert.strictEqual(groupStats("b").pts, 1);
    const template = env.loadTemplate();
    const context = buildContext(template, [{ _id: "a" }, { _id: "b" }], [match]);
    assert.strictEqual(context.matchResult("QF1").winner._id, "b");
  });

  it("renders finished shootout scores in all schedule views, including both TV phases", function () {
    const hbs = allowInsecurePrototypeAccess(handlebars);
    hbs.registerHelper("formatPenaltyResult", formatPenaltyResult);
    hbs.registerHelper("formatTime", () => "10:00");
    hbs.registerHelper("formatExtraTime", () => "");
    hbs.registerHelper("streq", function (a, b, options) {
      return a === b ? options.fn(this) : options.inverse(this);
    });

    const results = [true, true, true, true, true, false, false, false, false, false];
    const group = new env.Game({ gamePhase: "Group_Stage", goals: [1, 1], opponents: ["A", "B"], penaltyShootout: shootout(0, results, true) });
    const knockout = new env.Game({ gamePhase: "Final", goals: [2, 2], opponents: ["C", "D"], penaltyShootout: shootout(1, results, true) });
    const ordinary = new env.Game({ gamePhase: "Group_Stage", goals: [1, 0], opponents: ["E", "F"] });
    const ongoing = new env.Game({ gamePhase: "Final", goals: [0, 0], opponents: ["G", "H"], penaltyShootout: shootout(0, results) });
    const games = [group, knockout, ordinary, ongoing];
    for (const [file, key] of [["home.hbs", "gameslist"], ["layouts/TVPage.hbs", "gameslist"], ["layouts/schedulelist.hbs", "list"]]) {
      const template = hbs.compile(fs.readFileSync(path.join(env.ROOT, "src", "views", file), "utf8"));
      const output = template({ [key]: games });
      assert.match(output, /1\s*:\s*1 \(n\. E\. 3:2\)/, file);
      assert.match(output, /2\s*:\s*2 \(n\. E\. 2:3\)/, file);
      assert.match(output, /<td>1\s*:\s*0<\/td>/, file);
      assert.match(output, /<td>0\s*:\s*0<\/td>/, file);
    }
  });
});
