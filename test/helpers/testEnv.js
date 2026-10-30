// Shared test environment: isolated Mongo test database, seed data, and an HTTP harness for the GameController.
// The productive database (TournamentDB) is never touched.
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");
const jwt = require("jsonwebtoken");
const express = require("express");
const mongoose = require("mongoose");

const ROOT = path.join(__dirname, "..", "..");
const TEST_DB_URI = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/TournamentDB_test";

// Port 0 = random free port, so the socket.io server of the GameController does not collide with a running app
process.argv.push("--socket-port", "0");

for (const model of ["Game", "Team", "MainSettings", "GeneralCounters", "Player", "User", "Feedback", "ProductSales", "Decision"]) {
  require(path.join(ROOT, "src", "models", model));
}

const Game = mongoose.model("Game");
const Team = mongoose.model("Team");
const MainSettings = mongoose.model("MainSettings");
const Counters = mongoose.model("generalCounters");
const Decision = mongoose.model("Decision");

const MIN = 60 * 1000;

async function connect() {
  if (!/test/i.test(TEST_DB_URI)) throw new Error("Refusing to run tests against a non-test database: " + TEST_DB_URI);
  if (mongoose.connection.readyState === 0) await mongoose.connect(TEST_DB_URI);
}

async function disconnect() {
  await mongoose.disconnect();
}

async function resetDb() {
  await Promise.all([Game.deleteMany({}), Team.deleteMany({}), MainSettings.deleteMany({}), Counters.deleteMany({}), Decision.deleteMany({})]);
}

// Durations are stored in milliseconds like the MainSettingController does
async function seedSettings(overrides = {}) {
  return MainSettings.create({
    TornamentStartTime: new Date("2030-06-01T10:00:00.000Z"),
    timeBetweenGames: 2 * MIN,
    gameDurationGroupStage: 10 * MIN,
    gameDurationQuarterfinals: 12 * MIN,
    gameDurationSemifinals: 15 * MIN,
    gameDurationFinal: 20 * MIN,
    timeBetweenGamePhases: 10 * MIN,
    goalsforSekt: 10,
    scheduleTemplate: "4groups_4teams.yaml",
    ...overrides,
  });
}

async function seedCounters(goalSektCounter = 10) {
  return Counters.create({ allGoals: 0, gamesPlayed: 0, goalSektCounter });
}

// Same defaults as TeamController "/add"
function teamDoc(name, group) {
  return {
    name,
    group,
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    gamesDraw: 0,
    goals: [0, 0],
    goalsGroupStage: [0, 0],
    sektWon: 0,
    points_Group_Stage: 0,
    points_General: 0,
    gamesPlayed_Group_Stage: 0,
  };
}

async function seedTeams(groupNames = ["A", "B", "C", "D"], perGroup = 4) {
  const docs = [];
  for (const g of groupNames) {
    for (let i = 1; i <= perGroup; i++) docs.push(teamDoc(`${g}${i}`, g));
  }
  return Team.insertMany(docs);
}

function loadTemplate(name = "4groups_4teams.yaml") {
  return yaml.load(fs.readFileSync(path.join(ROOT, "src", "config", "scheduling_templates", name), "utf8"));
}

function adminCookie() {
  const keytokens = yaml.load(fs.readFileSync(path.join(ROOT, "keytokens.yaml"), "utf8"));
  return "jwt=" + jwt.sign({ username: "test", role: "admin" }, keytokens.jwtSecretkey);
}

// Mounts the real GameController router on a throw-away express app
async function startGameApp() {
  const { router } = require(path.join(ROOT, "src", "controllers", "GameController"));
  const { router: decisionRouter } = require(path.join(ROOT, "src", "controllers", "DecisionController"));
  const app = express();
  app.use("/game", router);
  app.use("/decisions", decisionRouter);
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookie = adminCookie();

  const call = (method, url) => fetch(base + url, { method, headers: { Cookie: cookie }, redirect: "manual" });

  return {
    base,
    close: () => new Promise(resolve => server.close(resolve)),
    start: id => call("POST", `/game/start/${id}`),
    score: (id, teamNum, delta) => call("POST", `/game/${id}/change-score/${teamNum}/${delta}`),
    end: id => call("GET", `/game/${id}/endGame`),
    autoPlay: limit => call("POST", `/game/autoPlayGames/${limit}`),
    pendingDecisions: async () => (await call("GET", "/decisions/pending")).json(),
    // takes the first option of every pending decision (like autoplay does)
    async resolveAll() {
      for (const d of await this.pendingDecisions()) await this.resolveDecision(d.key, d.options[0].id);
    },
    resolveDecision: (key, choice) =>
      fetch(base + "/decisions/resolve", {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ key, choice }),
      }),
    // start -> score goals one by one -> end, like an operator at the play page
    async play(game, goals) {
      let res = await this.start(game._id);
      if (res.status !== 200) throw new Error(`start failed for game ${game.number}: ${res.status}`);
      for (const [idx, count] of goals.entries()) {
        for (let i = 0; i < count; i++) {
          res = await this.score(game._id, idx + 1, 1);
          if (res.status !== 200) throw new Error(`score failed for game ${game.number}: ${res.status}`);
        }
      }
      res = await this.end(game._id);
      if (res.status >= 400) throw new Error(`end failed for game ${game.number}: ${res.status}`);
    },
  };
}

const isDummyOpponent = o => !!o && typeof o === "object" && o.isDummy === true;
const idOf = o => String(o);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(fn, timeoutMs = 2000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) return value;
    await sleep(25);
  }
}

module.exports = {
  ROOT,
  MIN,
  Game,
  Team,
  MainSettings,
  Counters,
  Decision,
  connect,
  disconnect,
  resetDb,
  seedSettings,
  seedCounters,
  seedTeams,
  teamDoc,
  loadTemplate,
  startGameApp,
  isDummyOpponent,
  idOf,
  waitFor,
};
