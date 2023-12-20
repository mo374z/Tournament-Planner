const mongoose = require('mongoose');

var MainSettingsSchema = new mongoose.Schema({
    TornamentStartTime:{
        type: Date,
        required: 'This field is required'
    },
    timeBetweenGames: {     //milliseconds
        type: Number,
        required: 'This field is required'
    },
    gameDurationGroupStage: {   //milliseconds
        type: Number,
        required: 'This field is required'
    },
    gameDurationGroupStage: {   //milliseconds
        type: Number,
        required: 'This field is required'
    },
    gameDurationQuarterfinals: {    //milliseconds
        type: Number,
        required: 'This field is required'
    },

});

mongoose.model('MainSettings', MainSettingsSchema);