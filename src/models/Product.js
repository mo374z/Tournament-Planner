const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    productId: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    category: {
        type: String,
        enum: ['drinks', 'food'],
        required: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    points: {
        type: Number,
        default: 0,
        min: 0,
        validate: Number.isInteger
    },
    active: {
        type: Boolean,
        default: true
    },
    sendToKitchen: {
        type: Boolean,
        default: false
    },
    deleted: {
        type: Boolean,
        default: false
    },
    sortOrder: {
        type: Number,
        default: 0
    }
});

module.exports = mongoose.model('Product', productSchema);
