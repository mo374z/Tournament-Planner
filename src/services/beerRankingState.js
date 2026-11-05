const mongoose = require('mongoose');

// Liefert den aktuellen Zustand des Bier-Rankings (aktiv/eingefroren)
async function getBeerRankingState() {
    const MainSettings = mongoose.model('MainSettings');
    const settings = await MainSettings.findOne({}, { beerRankingOptions: 1 }).lean();
    const options = (settings && settings.beerRankingOptions) || {};
    const enabled = options.enabled !== false;
    return { enabled, frozen: enabled && options.frozen === true };
}

module.exports = { getBeerRankingState };
