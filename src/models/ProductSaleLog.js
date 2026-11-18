const mongoose = require('mongoose');

// Eine Zeile pro Produkt und Bestellung, damit Verkäufe nach Uhrzeit ausgewertet werden können
const productSaleLogSchema = new mongoose.Schema({
    orderId: { type: String, required: true, index: true },
    productId: { type: String, required: true, index: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now, index: true }
});

mongoose.model('ProductSaleLog', productSaleLogSchema);
