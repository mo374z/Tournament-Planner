const mongoose = require('mongoose');

var studentSchema = new mongoose.Schema({
    fullName:{
        type: String,
        required: 'This field is required'
    },
    email: {
        type: String,
        required: 'This field is required'
    },
    mobile: {
        type: String,
        required: 'This field is required'
    },
    city: {
        type: String,
        required: 'This field is required'
    }



});

mongoose.model('Student', studentSchema);