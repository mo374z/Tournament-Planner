const mongoose = require('mongoose');


var TeamSchema = new mongoose.Schema({
    username:{
        type: String,
        required: 'This field is required'
    },
    password: {
        type: String,
        required: 'This field is required'
    },
    role: {
        type: String,
        required: 'This field is required'
    }

});

mongoose.model('User', TeamSchema);