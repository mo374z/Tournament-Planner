const INITIAL_KICKS = 5;

function summarize(shootout) {
  const kicks = [[], []];
  for (const kick of shootout.kicks) kicks[kick.team].push(kick.scored);
  const scores = kicks.map((team) => team.filter(Boolean).length);
  const counts = kicks.map((team) => team.length);
  let winner = null;
  for (const team of [0, 1]) {
    const other = 1 - team;
    if (counts[team] <= INITIAL_KICKS && counts[other] <= INITIAL_KICKS &&
        scores[team] > scores[other] + INITIAL_KICKS - counts[other]) {
      winner = team;
    }
  }
  if (counts[0] >= INITIAL_KICKS && counts[0] === counts[1] && scores[0] !== scores[1]) {
    winner = scores[0] > scores[1] ? 0 : 1;
  }
  return {
    ...shootout,
    teamKicks: kicks,
    scores,
    winner,
    nextTeam: winner === null ? (shootout.starter + shootout.kicks.length) % 2 : null,
  };
}

function gameWinner(game) {
  if (game.goals[0] !== game.goals[1]) return game.goals[0] > game.goals[1] ? 0 : 1;
  if (game.penaltyShootout && game.penaltyShootout.finished) {
    return summarize(game.penaltyShootout.toObject ? game.penaltyShootout.toObject() : game.penaltyShootout).winner;
  }
  return null;
}

function formatPenaltyResult(shootout) {
  if (!shootout || !shootout.finished) return "";
  const scores = summarize(shootout).scores;
  return ` (n. E. ${scores[0]}:${scores[1]})`;
}

module.exports = { INITIAL_KICKS, summarize, gameWinner, formatPenaltyResult };
