const mongoose = require('mongoose');

var MainSettingsSchema = new mongoose.Schema({
    TornamentStartTime:{
        type: Date,
        required: 'This field is required'
    },
    timeBetweenGames: {     //minutes
        type: Number,
        required: 'This field is required'
    },
    gameDurationGroupStage: {   //minutes
        type: Number,
        required: 'This field is required'
    },
    gameDurationGroupStage: {   //minutes
        type: Number,
        required: 'This field is required'
    },
    gameDurationQuarterfinals: {    //minutes
        type: Number,
        required: 'This field is required'
    },
    goalsforSekt: {
        type: Number,
        required: 'This field is required'
    },

});

mongoose.model('MainSettings', MainSettingsSchema);