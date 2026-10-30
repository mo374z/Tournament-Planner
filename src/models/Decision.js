const mongoose = require('mongoose');

// Manuelle Entscheidung, die das Schedule-Template verlangt (z.B. Gegnertausch, Gleichstand).
// Solange status "pending" ist, bleiben die betroffenen Spiele gesperrt.
const DecisionSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    type: { type: String, required: true }, // opponent_swap | tie_break
    scope: { type: String, default: null }, // Block-ID bzw. Wertung (z.B. "group:A")
    title: { type: String },
    description: { type: String },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    options: [{ id: String, label: String, _id: false }],
    blocksMatches: { type: [String], default: [] },
    signature: { type: String }, // ändert sich die Ausgangslage, wird die Entscheidung erneut abgefragt
    status: { type: String, enum: ['pending', 'resolved'], default: 'pending' },
    choice: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
});

mongoose.model('Decision', DecisionSchema);
