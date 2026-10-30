//Controller für die Verwaltung von Entscheidungen im Turnier (manuelle Entscheidungen und Gegnertausch)
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { commonMiddleware } = require('../middleware/auth');
const { loadTemplate } = require('../services/tournamentTemplate');
const { getPendingDecisions, resolveDecision } = require('../services/decisions');
const { ScheduleGenerator } = require('./ScheduleGenerator');

commonMiddleware(router, ['admin']);
router.use(express.json());

// Alle offenen manuellen Entscheidungen (werden auf jeder Admin-Seite als Popup angezeigt)
router.get('/pending', async (req, res) => {
  try {
    // Anzeige-Daten (z. B. Tabellenwerte) vor der Ausgabe aktualisieren
    const settings = await mongoose.model('MainSettings').findOne({});
    if (settings) await new ScheduleGenerator(loadTemplate(settings.scheduleTemplate), settings).updateSchedule();
    res.json(await getPendingDecisions());
  } catch (err) {
    console.error('Error loading decisions:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Entscheidung treffen und den Spielplan danach neu berechnen
router.post('/resolve', async (req, res) => {
  try {
    const { key, choice } = req.body || {};
    await resolveDecision(key, choice);
    const settings = await mongoose.model('MainSettings').findOne({});
    const changed = await new ScheduleGenerator(loadTemplate(settings.scheduleTemplate), settings).updateSchedule();
    res.json({ success: true, updatedGames: changed, pending: await getPendingDecisions() });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = { router };
