// Reine Regel-Funktionen (ohne Datenbankzugriff), die ausschließlich aus dem Schedule-Template gesteuert werden:
// Rundenplan, Tabellen, Gesamtwertung, Pools, Gegnertausch und Auflösung der Platzhalter.

const isDummy = (o) => !o || o.isDummy === true;
const idOf = (o) => (isDummy(o) ? null : String(o._id || o));

function phaseMatches(template) {
  const ko = template.knockout_stage;
  const phases = ko && ko.enabled !== false ? ko.phases || [] : [];
  const result = [];
  for (const phase of phases) {
    if (phase.enabled === false) continue;
    phase.matches.forEach((match, index) => result.push({ match, phase, index }));
  }
  return result;
}

function matchDisplayName(match, phase, index) {
  return match.display_name || `${phase.display_name} ${index + 1}`;
}

// Kreismethode; Spiele je Runde als [heimIndex, gastIndex]. Bei ungerader Teamzahl setzt je Runde ein Team aus.
function buildRoundRobin(teamCount, legs = 1) {
  const n = teamCount % 2 === 0 ? teamCount : teamCount + 1;
  const rounds = [];
  for (let round = 0; round < n - 1; round++) {
    const roundMatches = [];
    for (let match = 0; match < n / 2; match++) {
      const away = (n - 1 - match + round) % (n - 1);
      const pair = match === 0 ? [n - 1, away] : [(round + match) % (n - 1), away];
      if (pair[0] < teamCount && pair[1] < teamCount) roundMatches.push(pair);
    }
    rounds.push(roundMatches);
  }
  const all = rounds.slice();
  for (let leg = 2; leg <= legs; leg++) {
    for (const r of rounds) all.push(r.map(([h, a]) => (leg % 2 === 0 ? [a, h] : [h, a])));
  }
  return all;
}

function criterionValue(name, s) {
  switch (name) {
    case 'points': return s.pts;
    case 'goal_difference': return s.gf - s.ga;
    case 'goals_scored': return s.gf;
    case 'points_general': return s.ptsGen;
    case 'goal_difference_general': return s.gfGen - s.gaGen;
    case 'goals_scored_general': return s.gfGen;
    default: return 0;
  }
}

const emptyStats = () => ({ gp: 0, pts: 0, gf: 0, ga: 0, ptsGen: 0, gfGen: 0, gaGen: 0 });

// Statistik aller Teams aus beendeten Spielen. Gruppenwerte zählen nur Spiele der Gruppenphase.
function computeStats(games, groupPhaseKey, points) {
  const stats = new Map();
  const get = (id) => {
    if (!stats.has(id)) stats.set(id, emptyStats());
    return stats.get(id);
  };
  for (const g of games) {
    if (g.status !== 'Ended') continue;
    const a = idOf(g.opponents[0]);
    const b = idOf(g.opponents[1]);
    if (!a || !b) continue;
    const [ga, gb] = g.goals;
    const pa = ga > gb ? points.win : ga === gb ? points.draw : points.loss;
    const pb = gb > ga ? points.win : ga === gb ? points.draw : points.loss;
    const isGroup = g.gamePhase === groupPhaseKey;
    for (const [id, own, opp, pts] of [[a, ga, gb, pa], [b, gb, ga, pb]]) {
      const s = get(id);
      s.ptsGen += pts; s.gfGen += own; s.gaGen += opp;
      if (isGroup) { s.gp++; s.pts += pts; s.gf += own; s.ga += opp; }
    }
  }
  return get;
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
  return 0;
}

const byName = (a, b) => String(a.name).localeCompare(String(b.name)) || String(a._id).localeCompare(String(b._id));

// Sortiert Teams nach den Kriterien (absteigend). "head_to_head" wertet den direkten Vergleich nur
// innerhalb von Teams aus, die bis dahin gleichauf liegen.
// opts.tieSink: Array, bekommt alle Teams-Gruppen, die nach ALLEN Kriterien gleichauf liegen.
// opts.manualOrder: Map(teamId -> Position), entscheidet nur bei vollständigem Gleichstand (manuelle Entscheidung).
function sortTeams(teams, criteria, getStats, h2hGames = [], points = { win: 3, draw: 1, loss: 0 }, opts = {}) {
  const { tieSink, manualOrder } = opts;
  const pos = (t) => (manualOrder && manualOrder.has(idOf(t)) ? manualOrder.get(idOf(t)) : 1e9);
  const tail = (a, b) => pos(a) - pos(b) || byName(a, b);
  const h2hIndex = criteria.indexOf('head_to_head');
  const before = h2hIndex === -1 ? criteria : criteria.slice(0, h2hIndex);
  const after = h2hIndex === -1 ? [] : criteria.slice(h2hIndex + 1);
  const keyOf = (t, list) => list.map((c) => criterionValue(c, getStats(idOf(t))));

  const sorted = teams.slice().sort((a, b) => compareKeys(keyOf(a, before), keyOf(b, before)) || (h2hIndex === -1 ? tail(a, b) : byName(a, b)));
  if (h2hIndex === -1) {
    if (tieSink) {
      let s = 0;
      while (s < sorted.length) {
        let e = s + 1;
        while (e < sorted.length && compareKeys(keyOf(sorted[s], before), keyOf(sorted[e], before)) === 0) e++;
        if (e - s > 1) tieSink.push({ teams: sorted.slice(s, e), start: s });
        s = e;
      }
    }
    return sorted;
  }

  const result = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && compareKeys(keyOf(sorted[i], before), keyOf(sorted[j], before)) === 0) j++;
    const cluster = sorted.slice(i, j);
    if (cluster.length > 1) {
      const ids = new Set(cluster.map(idOf));
      const mini = new Map(cluster.map((t) => [idOf(t), { pts: 0, gf: 0, ga: 0 }]));
      for (const g of h2hGames) {
        const a = idOf(g.opponents[0]);
        const b = idOf(g.opponents[1]);
        if (g.status !== 'Ended' || !ids.has(a) || !ids.has(b)) continue;
        const [ga, gb] = g.goals;
        mini.get(a).pts += ga > gb ? points.win : ga === gb ? points.draw : points.loss;
        mini.get(b).pts += gb > ga ? points.win : ga === gb ? points.draw : points.loss;
        mini.get(a).gf += ga; mini.get(a).ga += gb;
        mini.get(b).gf += gb; mini.get(b).ga += ga;
      }
      const miniKey = (t) => { const m = mini.get(idOf(t)); return [m.pts, m.gf - m.ga, m.gf]; };
      const sameRank = (a, b) => compareKeys(miniKey(a), miniKey(b)) === 0 && compareKeys(keyOf(a, after), keyOf(b, after)) === 0;
      cluster.sort((a, b) => compareKeys(miniKey(a), miniKey(b)) || compareKeys(keyOf(a, after), keyOf(b, after)) || tail(a, b));
      if (tieSink) {
        let s = 0;
        while (s < cluster.length) {
          let e = s + 1;
          while (e < cluster.length && sameRank(cluster[s], cluster[e])) e++;
          if (e - s > 1) tieSink.push({ teams: cluster.slice(s, e), start: i + s });
          s = e;
        }
      }
    }
    result.push(...cluster);
    i = j;
  }
  return result;
}

const MAX_TIE_SIZE = 4; // größere Gleichstände werden nach Name sortiert (zu viele Reihenfolgen zur Auswahl)

function scopeLabel(scope, template) {
  if (scope.startsWith('group:')) return `Gruppe ${scope.slice(6)}`;
  if (scope === 'best_of') {
    const best = (template.group_stage.advancement || {}).best_of_rank || {};
    return `beste Teams auf Gruppenplatz ${best.rank}`;
  }
  if (scope === 'overall_qualified') return 'Gesamtwertung der weitergekommenen Teams';
  if (scope === 'overall_rest') return 'Gesamtwertung der ausgeschiedenen Teams';
  const poolName = scope.slice(5);
  return `Pool ${((template.pools || {})[poolName] || {}).display_name || poolName}`;
}

// Anfrage für eine manuelle Entscheidung bei vollständigem Gleichstand
function makeTieRequest(scope, cluster, template) {
  const ids = cluster.teams.map(idOf);
  const label = scopeLabel(scope, template);
  const names = cluster.teams.map((t) => t.name).join(', ');
  return {
    key: `tie:${scope}:${ids.slice().sort().join('+')}`,
    type: 'tie_break',
    scope,
    title: `Gleichstand: ${label}`,
    description: `Die Teams ${names} sind in der Wertung "${label}" nach allen Kriterien gleichauf (Plätze ${cluster.start + 1}-${cluster.start + ids.length} dieser Wertung). `
      + 'Das Template verlangt eine manuelle Entscheidung (final_tiebreak: manual). '
      + 'Alle Spiele, die von dieser Wertung abhängen, bleiben gesperrt, bis die Reihenfolge festgelegt ist.',
    details: { teams: cluster.teams.map((t) => ({ id: idOf(t), name: t.name, group: t.group || null })) },
    options: [...permutations(cluster.teams)].map((p) => ({
      id: p.map(idOf).join(','),
      label: p.map((t, i) => `${i + 1}. ${t.name}`).join('   '),
    })),
    blocksMatches: [],
    signature: ids.slice().sort().join('+'),
  };
}

// Baut den Auswertungs-Kontext: Tabellen, Gesamtwertung, Pools, Spielergebnisse.
// decisions: gespeicherte manuelle Entscheidungen (Gleichstände). Offene Gleichstände landen in ctx.tieRequests;
// die davon abhängigen Quellen (Gruppenplätze, Gesamtwertung, Pools) gelten dann als noch nicht bekannt.
function buildContext(template, teams, games, decisions = []) {
  const gs = template.group_stage || {};
  const groupKey = gs.game_phase_key || 'Group_Stage';
  const points = gs.points || { win: 3, draw: 1, loss: 0 };
  const getStats = computeStats(games, groupKey, points);
  const teamById = new Map(teams.map((t) => [String(t._id), t]));
  const groupGames = games.filter((g) => g.gamePhase === groupKey);
  const tiebreakers = (gs.ranking && gs.ranking.tiebreakers) || ['points', 'goal_difference', 'goals_scored'];
  const noH2h = tiebreakers.filter((c) => c !== 'head_to_head');
  const groupNames = gs.enabled === false ? [] : (gs.groups || []).map((g) => g.name);

  const manualTies = !!(gs.ranking && gs.ranking.final_tiebreak === 'manual');
  const resolvedKeys = new Set();
  const orderByScope = new Map();
  for (const d of decisions) {
    if (d.type !== 'tie_break' || d.status !== 'resolved' || !d.choice) continue;
    resolvedKeys.add(d.key);
    if (!orderByScope.has(d.scope)) orderByScope.set(d.scope, new Map());
    d.choice.split(',').forEach((id, i) => orderByScope.get(d.scope).set(id, i));
  }
  const tieRequests = [];
  const pendingScopes = new Set();
  const sortScoped = (scope, list, criteria, stats, h2h, { track = true, cut = null } = {}) => {
    const sink = manualTies && track ? [] : null;
    const sorted = sortTeams(list, criteria, stats, h2h, points, { tieSink: sink, manualOrder: orderByScope.get(scope) });
    for (const cluster of sink || []) {
      if (cluster.teams.length > MAX_TIE_SIZE) continue;
      // Beim Weiterkommen zählt nur ein Gleichstand, der über die Grenze hinweg geht
      if (cut !== null && !(cluster.start < cut && cluster.start + cluster.teams.length > cut)) continue;
      const request = makeTieRequest(scope, cluster, template);
      // Aktuelle Werte der Teams (Gruppenphase und Gesamt) für die Anzeige im Popup
      request.details.teams = request.details.teams.map((t) => {
        const s = stats(t.id);
        return { ...t, stats: { pts: s.pts, gf: s.gf, ga: s.ga, ptsGen: s.ptsGen, gfGen: s.gfGen, gaGen: s.gaGen } };
      });
      if (resolvedKeys.has(request.key)) continue;
      tieRequests.push(request);
      pendingScopes.add(scope);
    }
    return sorted;
  };

  const tables = {};
  const groupDone = {};
  for (const name of groupNames) {
    const members = teams.filter((t) => t.group === name);
    const memberIds = new Set(members.map((t) => String(t._id)));
    const own = groupGames.filter((g) => memberIds.has(idOf(g.opponents[0])));
    const done = own.length > 0 && own.every((g) => g.status === 'Ended');
    tables[name] = sortScoped(`group:${name}`, members, tiebreakers, getStats, own, { track: done });
    groupDone[name] = done && !pendingScopes.has(`group:${name}`);
  }
  const groupStageDone = groupNames.length > 0 && groupNames.every((n) => groupDone[n]);

  let overall = null;
  if (groupStageDone) {
    const adv = gs.advancement || { spots_per_group: 2 };
    const fr = template.final_ranking || {};
    const qualified = [];
    const rest = [];
    for (const name of groupNames) {
      tables[name].forEach((t, i) => (i < adv.spots_per_group ? qualified : rest).push(t));
    }
    const best = adv.best_of_rank;
    if (best && best.count > 0) {
      const cands = groupNames.map((n) => tables[n][best.rank - 1]).filter((t) => t && rest.includes(t));
      for (const t of sortScoped('best_of', cands, noH2h, getStats, [], { cut: best.count }).slice(0, best.count)) {
        qualified.push(t);
        rest.splice(rest.indexOf(t), 1);
      }
    }
    const qSort = fr.qualified_sort || ['points_general', 'goal_difference_general', 'goals_scored_general'];
    const nSort = fr.non_qualified_sort || ['points', 'goal_difference', 'goals_scored'];
    // Die Gesamtwertung ist eine Setzliste und basiert nur auf der Gruppenphase,
    // damit sich bereits vergebene Paarungen durch K.o.-Spiele nicht mehr verschieben.
    const seedStats = computeStats(groupGames, groupKey, points);
    overall = [
      ...sortScoped('overall_qualified', qualified, qSort, seedStats, []),
      ...sortScoped('overall_rest', rest, nSort, seedStats, []),
    ];
    if (['best_of', 'overall_qualified', 'overall_rest'].some((s) => pendingScopes.has(s))) overall = null;
  }

  const gameByMatch = new Map();
  for (const g of games) if (g.matchId) gameByMatch.set(g.matchId, g);
  const matches = phaseMatches(template);
  const matchById = new Map(matches.map((m) => [m.match.id, m]));

  const matchResult = (matchId) => {
    const g = gameByMatch.get(matchId);
    if (!g || g.status !== 'Ended' || isDummy(g.opponents[0]) || isDummy(g.opponents[1])) return null;
    const w = winnerIndex(g.goals);
    return { winner: teamById.get(idOf(g.opponents[w])), loser: teamById.get(idOf(g.opponents[1 - w])) };
  };

  const pools = {};
  for (const [poolName, pool] of Object.entries(template.pools || {})) {
    const phaseId = pool.teams_from && pool.teams_from.phase;
    const list = matches.filter((m) => m.phase.id === phaseId);
    const results = list.map((m) => matchResult(m.match.id));
    if (!list.length || results.some((r) => !r)) { pools[poolName] = null; continue; }
    const picked = results.map((r) => (pool.teams_from.type === 'winners_of_phase' ? r.winner : r.loser));
    const scope = `pool:${poolName}`;
    const sortedPool = sortScoped(scope, picked, pool.then || noH2h, getStats, []);
    pools[poolName] = pendingScopes.has(scope) ? null : sortedPool;
  }

  return { template, teams, teamById, games, tables, groupDone, groupStageDone, overall, pools, matchResult, matchById, gameByMatch, tieRequests };
}

function resolveSource(src, ctx) {
  switch (src.type) {
    case 'group_rank': return (ctx.groupDone[src.group] && ctx.tables[src.group][src.rank - 1]) || null;
    case 'winner': { const r = ctx.matchResult(src.match); return r ? r.winner : null; }
    case 'loser': { const r = ctx.matchResult(src.match); return r ? r.loser : null; }
    case 'pool_rank': return (ctx.pools[src.pool] && ctx.pools[src.pool][src.rank - 1]) || null;
    case 'overall_rank': return (ctx.overall && ctx.overall[src.rank - 1]) || null;
    case 'team': return ctx.teams.find((t) => t.name === src.name) || null;
    default: return null;
  }
}

const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, k) => (values[k] !== undefined ? values[k] : ''));

// Platzhalter-Team für noch unbekannte Teilnehmer; der Text kommt aus display.placeholders.
function placeholderTeam(src, template) {
  const ph = (template.display && template.display.placeholders) || {};
  let name;
  let group = null;
  switch (src.type) {
    case 'group_rank':
      name = fill(ph.group_rank || '{rank}. aus Gruppe {group}', src);
      group = src.group;
      break;
    case 'winner':
    case 'loser': {
      const entry = phaseMatches(template).find((m) => m.match.id === src.match);
      const matchName = entry ? matchDisplayName(entry.match, entry.phase, entry.index) : src.match;
      name = fill(ph[src.type] || `${src.type === 'winner' ? 'Sieger' : 'Verlierer'} {match_name}`, { match_name: matchName });
      break;
    }
    case 'pool_rank': {
      const pool = (template.pools || {})[src.pool] || {};
      name = fill(ph.pool_rank || '{rank}. {pool_name}', { rank: src.rank, pool_name: pool.display_name || src.pool });
      break;
    }
    case 'overall_rank':
      name = fill(ph.overall_rank || '{rank}. Gesamtwertung', src);
      break;
    default:
      name = src.name || '?';
  }
  return { name, group, isDummy: true, gamesPlayed: 0 };
}

function countConflicts(order) {
  let n = 0;
  for (let i = 0; i + 1 < order.length; i += 2) {
    if (order[i].group && order[i].group === order[i + 1].group) n++;
  }
  return n;
}

function* permutations(items) {
  if (items.length <= 1) { yield items.slice(); return; }
  for (let i = 0; i < items.length; i++) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const p of permutations(rest)) yield [items[i], ...p];
  }
}

// Ordnet die Teams eines Blocks (in Spielreihenfolge, je zwei = ein Spiel) so um, dass möglichst wenige Paarungen
// aus derselben Gruppe entstehen; bei gleich vielen Konflikten wird so wenig wie möglich verschoben.
function minimalSwap(teams) {
  if (countConflicts(teams) === 0) return teams;
  if (teams.length <= 8) {
    const index = new Map(teams.map((t, i) => [t, i]));
    let best = null;
    let bestCost = null;
    for (const p of permutations(teams)) {
      const cost = [countConflicts(p), p.reduce((s, t, i) => s + Math.abs(index.get(t) - i), 0)];
      if (!best || cost[0] < bestCost[0] || (cost[0] === bestCost[0] && cost[1] < bestCost[1])) {
        best = p;
        bestCost = cost;
      }
    }
    return best;
  }
  // Große Blöcke: Gast-Team schrittweise mit dem nächstgelegenen späteren Team tauschen
  let order = teams.slice();
  for (let i = 0; i + 1 < order.length; i += 2) {
    if (!order[i].group || order[i].group !== order[i + 1].group) continue;
    for (let k = i + 2; k < order.length; k++) {
      const swapped = order.slice();
      [swapped[i + 1], swapped[k]] = [swapped[k], swapped[i + 1]];
      if (countConflicts(swapped) < countConflicts(order)) { order = swapped; break; }
    }
  }
  return order;
}

// Berechnet für einen Block die ursprüngliche Paarung und die getauschte Paarung (je Match-ID zwei Teams).
// Gibt null zurück, solange nicht alle Teams des Blocks feststehen.
function resolveSwapBlockDetail(block, ctx) {
  const entries = block.matches
    .map((id) => ctx.matchById.get(id))
    .filter(Boolean)
    .sort((a, b) => (a.match.final_placement || 0) - (b.match.final_placement || 0));
  const teams = [];
  for (const { match } of entries) {
    for (const src of [match.home, match.away]) {
      const t = resolveSource(src, ctx);
      if (!t) return null;
      teams.push(t);
    }
  }
  const order = minimalSwap(teams);
  const pairs = (list) => {
    const result = {};
    entries.forEach(({ match }, i) => { result[match.id] = [list[2 * i], list[2 * i + 1]]; });
    return result;
  };
  return {
    entries,
    original: pairs(teams),
    swapped: pairs(order),
    conflictsBefore: countConflicts(teams),
    conflictsAfter: countConflicts(order),
    changed: order.some((t, i) => t !== teams[i]),
  };
}

// Liefert je Match-ID die beiden (getauschten) Teams oder null, solange nicht alle Teams des Blocks feststehen.
function resolveSwapBlock(block, ctx) {
  const detail = resolveSwapBlockDetail(block, ctx);
  return detail ? detail.swapped : null;
}

function swapRequest(block, detail) {
  const show = (pairs) => detail.entries.map(({ match }) => ({
    matchId: match.id,
    name: match.display_name || match.id,
    home: { name: pairs[match.id][0].name, group: pairs[match.id][0].group || null },
    away: { name: pairs[match.id][1].name, group: pairs[match.id][1].group || null },
  }));
  const names = detail.entries.map(({ match }) => match.display_name || match.id).join(', ');
  const signature = detail.entries.map(({ match }) => detail.original[match.id].map(idOf).join('-')).join('|');
  return {
    key: `swap:${block.id}`,
    type: 'opponent_swap',
    scope: block.id,
    title: `Gegnertausch: ${names}`,
    description: `In der ursprünglichen Paarung spielen ${detail.conflictsBefore} Mal Teams aus derselben Gruppe gegeneinander. `
      + `Mit dem Gegnertausch (opponent_swap) wären es noch ${detail.conflictsAfter}. `
      + 'Ohne Entscheidung bleiben diese Spiele gesperrt.',
    details: {
      conflictsBefore: detail.conflictsBefore,
      conflictsAfter: detail.conflictsAfter,
      original: show(detail.original),
      swapped: show(detail.swapped),
    },
    options: [
      { id: 'swap', label: 'Gegnertausch bestätigen' },
      { id: 'keep', label: 'Ursprüngliche Paarungen beibehalten' },
    ],
    blocksMatches: block.matches.slice(),
    signature,
  };
}

// Plan für den aktuellen Turnierstand:
//   updates  = Spiele, die neu belegt werden können -> [{ gameId, opponents }]
//   requests = manuelle Entscheidungen, die noch offen sind (Gegnertausch, Gleichstände)
// decisions: gespeicherte Entscheidungen [{ key, type, scope, status, choice, signature }]
function computeSchedulePlan(template, teams, games, decisions = []) {
  const ctx = buildContext(template, teams, games, decisions);
  const updates = [];
  const requests = [...ctx.tieRequests];
  const handled = new Set();
  const swap = template.opponent_swap || {};

  const push = (game, next) => {
    if (next.some((t, i) => idOf(t) !== idOf(game.opponents[i]))) {
      updates.push({ gameId: game._id, opponents: next.map((t) => (isDummy(t) ? t : t._id || t)) });
    }
  };

  if (swap.enabled) {
    for (const block of swap.blocks || []) {
      const blockGames = block.matches.map((id) => ctx.gameByMatch.get(id));
      block.matches.forEach((id) => handled.add(id));
      // Nur komplett unbegonnene Blöcke werden (neu) belegt
      if (blockGames.some((g) => !g || g.status !== 'Scheduled')) continue;
      const detail = resolveSwapBlockDetail(block, ctx);
      if (!detail) continue;

      let pairs = detail.swapped;
      if (swap.manual_confirmation && detail.changed) {
        const request = swapRequest(block, detail);
        const decision = decisions.find((d) => d.key === request.key && d.status === 'resolved' && d.signature === request.signature);
        if (!decision) { requests.push(request); continue; }
        if (decision.choice === 'keep') pairs = detail.original;
      }
      blockGames.forEach((g, i) => push(g, pairs[block.matches[i]]));
    }
  }

  for (const { match } of phaseMatches(template)) {
    if (handled.has(match.id)) continue;
    const game = ctx.gameByMatch.get(match.id);
    if (!game || game.status !== 'Scheduled') continue;
    push(game, [match.home, match.away].map((src, i) => resolveSource(src, ctx) || game.opponents[i]));
  }
  return { updates, requests };
}

// Welche Spiele können nach dem aktuellen Stand neu belegt werden? -> [{ gameId, opponents }]
function computeOpponentUpdates(template, teams, games, decisions = []) {
  return computeSchedulePlan(template, teams, games, decisions).updates;
}

// Sieger-Index eines Spiels (0 = erstes Team); bei Gleichstand gewinnt das erste Team.
function winnerIndex(goals) {
  return goals[1] > goals[0] ? 1 : 0;
}

module.exports = {
  isDummy,
  idOf,
  phaseMatches,
  matchDisplayName,
  buildRoundRobin,
  computeStats,
  sortTeams,
  buildContext,
  resolveSource,
  placeholderTeam,
  minimalSwap,
  resolveSwapBlock,
  computeSchedulePlan,
  computeOpponentUpdates,
  winnerIndex,
};
