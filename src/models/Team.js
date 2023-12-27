const mongoose = require('mongoose');

var TeamSchema = new mongoose.Schema({
    name:{
        type: String,
        required: 'This field is required'
    },
    group: {
        type: String,
        required: 'This field is required'
    },
    goals: {
        type: Number,
        required: 'This field is required'
    }

});

mongoose.model('Team', TeamSchema);