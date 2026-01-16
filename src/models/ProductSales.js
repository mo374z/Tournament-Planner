const mongoose = require('mongoose');

const productSalesSchema = new mongoose.Schema({
    productId: {
        type: String,
        required: true,
        unique: true
    },
    productName: {
        type: String,
        required: true
    },
    category: {
        type: String,
        enum: ['drinks', 'food'],
        required: true
    },
    totalQuantitySold: {
        type: Number,
        default: 0
    },
    totalRevenue: {
        type: Number,
        default: 0
    },
    price: {
        type: Number,
        required: true
    },
    points: {
        type: Number,
        default: 0
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

// Update lastUpdated before saving
productSalesSchema.pre('save', function(next) {
    this.lastUpdated = Date.now();
    next();
});

mongoose.model('ProductSales', productSalesSchema);
