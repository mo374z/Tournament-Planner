const mongoose = require('mongoose');

const Decision = () => mongoose.model('Decision');

// Gleicht die gespeicherten Entscheidungen mit den aktuell offenen Anfragen ab:
//  - neue Anfragen werden als "pending" angelegt (bei autoResolve sofort mit der ersten Option entschieden)
//  - geänderte Ausgangslage setzt eine Entscheidung wieder auf "pending"
//  - offene Entscheidungen, die nicht mehr nötig sind, werden entfernt
// Gibt zurück, ob sich eine Entscheidung geändert hat, die den Spielplan beeinflusst.
async function syncDecisions(requests, { autoResolve = false } = {}) {
  let resolvedAny = false;
  for (const request of requests) {
    const existing = await Decision().findOne({ key: request.key });
    const fresh = {
      type: request.type,
      scope: request.scope,
      title: request.title,
      description: request.description,
      details: request.details,
      options: request.options,
      blocksMatches: request.blocksMatches,
      signature: request.signature,
      status: 'pending',
      choice: null,
      resolvedAt: null,
    };
    if (autoResolve) {
      fresh.status = 'resolved';
      fresh.choice = request.options[0].id;
      fresh.resolvedAt = new Date();
      resolvedAny = true;
    }
    if (!existing) {
      await Decision().create({ key: request.key, ...fresh });
    } else if (existing.status === 'pending' || existing.signature !== request.signature || autoResolve) {
      // Offene Entscheidungen behalten ihre Anzeige-Daten aktuell
      await Decision().updateOne({ key: request.key }, { $set: fresh });
    }
  }
  const keep = requests.map((r) => r.key);
  await Decision().deleteMany({ status: 'pending', key: { $nin: keep } });
  return resolvedAny;
}

async function getPendingDecisions() {
  return Decision().find({ status: 'pending' }).sort({ createdAt: 1 }).lean();
}

async function getAllDecisions() {
  return Decision().find({}).lean();
}

// Speichert die Entscheidung des Admins. Wirft einen Fehler bei unbekannter Entscheidung/Option.
async function resolveDecision(key, choice) {
  const decision = await Decision().findOne({ key });
  if (!decision) throw new Error('Entscheidung nicht gefunden');
  if (!decision.options.some((o) => o.id === choice)) throw new Error('Ungültige Option');
  decision.status = 'resolved';
  decision.choice = choice;
  decision.resolvedAt = new Date();
  await decision.save();
  return decision;
}

module.exports = { syncDecisions, getPendingDecisions, getAllDecisions, resolveDecision };
