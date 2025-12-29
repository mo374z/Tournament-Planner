const mongoose = require('mongoose');

var FeedbackSchema = new mongoose.Schema({
    title: {
        type: String,
        required: 'This field is required'
    },
    name: {
        type: String,
        required: false
    },
    message: {
        type: String,
        required: 'This field is required'
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    userRole: {
        type: String,
        default: 'anonymous'
    },
    isRead: {
        type: Boolean,
        default: false
    }
});

mongoose.model('Feedback', FeedbackSchema);