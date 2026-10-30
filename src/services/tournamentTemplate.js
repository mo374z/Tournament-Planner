const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { phaseMatches } = require('./tournamentRules');

const TEMPLATE_DIR = path.join(__dirname, '..', 'config', 'scheduling_templates');
const SOURCE_TYPES = ['group_rank', 'winner', 'loser', 'pool_rank', 'overall_rank', 'team'];
const CRITERIA = ['points', 'goal_difference', 'goals_scored', 'head_to_head',
  'points_general', 'goal_difference_general', 'goals_scored_general'];

// Prüft ein geladenes Template und liefert eine Liste verständlicher Fehlermeldungen (leer = gültig).
function validateTemplate(t) {
  const errors = [];
  if (!t || typeof t !== 'object') return ['Template ist leer oder kein YAML-Objekt'];

  const gs = t.group_stage || {};
  const groupsEnabled = gs.enabled !== false;
  const groups = groupsEnabled ? gs.groups || [] : [];
  const groupNames = groups.map((g) => g.name);
  if (groupsEnabled) {
    if (!groups.length) errors.push('group_stage.groups ist leer');
    if (new Set(groupNames).size !== groupNames.length) errors.push('Gruppennamen sind nicht eindeutig');
    groups.forEach((g) => { if (!(g.teams >= 2)) errors.push(`Gruppe ${g.name}: teams muss mindestens 2 sein`); });
    const fmt = gs.format || {};
    if (fmt.type && fmt.type !== 'round_robin') errors.push(`group_stage.format.type "${fmt.type}" wird nicht unterstützt`);
    if (fmt.legs !== undefined && ![1, 2].includes(fmt.legs)) errors.push('group_stage.format.legs muss 1 oder 2 sein');
    if (fmt.game_order && !['by_round', 'by_group'].includes(fmt.game_order)) errors.push('group_stage.format.game_order muss by_round oder by_group sein');
    if (fmt.seeding && !['sequential', 'random'].includes(fmt.seeding)) errors.push('group_stage.format.seeding muss sequential oder random sein');
    const pts = gs.points;
    if (!pts || [pts.win, pts.draw, pts.loss].some((v) => typeof v !== 'number')) errors.push('group_stage.points braucht win, draw und loss als Zahlen');
    for (const c of (gs.ranking && gs.ranking.tiebreakers) || []) {
      if (!CRITERIA.includes(c)) errors.push(`Unbekanntes Kriterium in ranking.tiebreakers: ${c}`);
    }
    if (!gs.advancement || !(gs.advancement.spots_per_group >= 0)) errors.push('group_stage.advancement.spots_per_group fehlt');
    const tiebreak = gs.ranking && gs.ranking.final_tiebreak;
    if (tiebreak && !['manual', 'alphabetical'].includes(tiebreak)) errors.push('group_stage.ranking.final_tiebreak muss manual oder alphabetical sein');
  }
  const total = groups.reduce((s, g) => s + (g.teams || 0), 0);
  if (groupsEnabled && t.meta && t.meta.total_teams && t.meta.total_teams !== total) {
    errors.push(`Im Template steht meta.total_teams = ${t.meta.total_teams}, die Gruppen ergeben aber zusammen ${total} Teams. Bitte eine der beiden Angaben korrigieren.`);
  }

  const matches = phaseMatches(t);
  const ids = matches.map((m) => m.match.id);
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) errors.push('Match-IDs in knockout_stage sind nicht eindeutig');
  const phaseIds = (t.knockout_stage && t.knockout_stage.phases || []).map((p) => p.id);
  const pools = t.pools || {};

  for (const phase of (t.knockout_stage && t.knockout_stage.phases) || []) {
    if (!phase.game_phase_key) errors.push(`Phase ${phase.id}: game_phase_key fehlt`);
    if (!phase.duration_setting) errors.push(`Phase ${phase.id}: duration_setting fehlt`);
  }
  for (const [name, pool] of Object.entries(pools)) {
    const from = pool.teams_from || {};
    if (!['losers_of_phase', 'winners_of_phase'].includes(from.type)) errors.push(`Pool ${name}: teams_from.type ungültig`);
    if (!phaseIds.includes(from.phase)) errors.push(`Pool ${name}: Phase "${from.phase}" existiert nicht`);
  }

  const checkSource = (src, where) => {
    if (!src || !SOURCE_TYPES.includes(src.type)) { errors.push(`${where}: ungültige Quelle`); return; }
    if (src.type === 'group_rank') {
      const g = groups.find((x) => x.name === src.group);
      if (!g) errors.push(`${where}: Gruppe ${src.group} existiert nicht`);
      else if (!(src.rank >= 1 && src.rank <= g.teams)) errors.push(`${where}: Rang ${src.rank} existiert in Gruppe ${src.group} nicht`);
    } else if (src.type === 'winner' || src.type === 'loser') {
      if (!idSet.has(src.match)) errors.push(`${where}: Match ${src.match} existiert nicht`);
    } else if (src.type === 'pool_rank') {
      if (!pools[src.pool]) errors.push(`${where}: Pool ${src.pool} existiert nicht`);
    } else if (src.type === 'overall_rank') {
      if (!groupsEnabled) errors.push(`${where}: overall_rank braucht eine aktive Gruppenphase`);
      else if (!(src.rank >= 1 && src.rank <= total)) errors.push(`${where}: Gesamtrang ${src.rank} existiert nicht`);
    }
  };

  const placements = [];
  for (const { match } of matches) {
    checkSource(match.home, `Match ${match.id} (home)`);
    checkSource(match.away, `Match ${match.id} (away)`);
    if (match.final_placement) placements.push(match.final_placement, match.final_placement + 1);
  }
  if (placements.length && new Set(placements).size !== placements.length) {
    errors.push('Mehrere Spiele vergeben dieselben Plätze (final_placement überschneidet sich; jedes Spiel vergibt Platz p für den Sieger und p+1 für den Verlierer)');
  }

  const swap = t.opponent_swap;
  if (swap && swap.manual_confirmation !== undefined && typeof swap.manual_confirmation !== 'boolean') {
    errors.push('opponent_swap.manual_confirmation muss true oder false sein');
  }
  if (swap && swap.enabled) {
    for (const block of swap.blocks || []) {
      for (const id of block.matches || []) if (!idSet.has(id)) errors.push(`opponent_swap ${block.id}: Match ${id} existiert nicht`);
    }
  }
  return errors;
}

function safeName(file) {
  const base = path.basename(String(file || ''));
  if (!/\.ya?ml$/i.test(base)) throw new Error(`Ungültiger Template-Dateiname: ${file}`);
  return base;
}

function loadTemplate(file, { validate = true } = {}) {
  const full = path.join(TEMPLATE_DIR, safeName(file));
  const template = yaml.load(fs.readFileSync(full, 'utf8'));
  if (validate) {
    const errors = validateTemplate(template);
    if (errors.length) throw new Error(`Template ${file} ist ungültig:\n- ${errors.join('\n- ')}`);
  }
  return template;
}

// Liste aller Templates mit Name und Beschreibung für die Auswahl in den Main Settings.
function listTemplates() {
  return fs.readdirSync(TEMPLATE_DIR)
    .filter((f) => /\.ya?ml$/i.test(f))
    .sort()
    .map((file) => {
      try {
        const t = yaml.load(fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8')) || {};
        const meta = t.meta || {};
        return {
          file,
          name: meta.name || file,
          description: (meta.description || '').replace(/\s+/g, ' ').trim(),
          valid: validateTemplate(t).length === 0,
        };
      } catch (e) {
        return { file, name: file, description: `Datei nicht lesbar: ${e.message}`, valid: false };
      }
    });
}

module.exports = { TEMPLATE_DIR, loadTemplate, listTemplates, validateTemplate };
