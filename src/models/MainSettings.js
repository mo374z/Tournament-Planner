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
    gameDurationQuarterfinals: {    //minutes
        type: Number,
        required: 'This field is required'
    },
    gameDurationSemifinals: {    //minutes  gameDurationSemifinals
        type: Number,
        required: 'This field is required'
    },
    // gameDurationRankings: {    //minutes
    //     type: Number,
    //     required: 'This field is required'
    // },
    gameDurationFinal: {    //minutes
        type: Number,
        required: 'This field is required'
    },
    timeBetweenGamePhases: {    //minutes
        type: Number,
        required: 'This field is required'
    },
    goalsforSekt: {
        type: Number,
        required: 'This field is required'
    },
    groups: {
        type: [String],
        default: []
    },
    scheduleTemplate: {
        type: String,
        default: '4groups_4teams.yaml'
    },
    publicPageOptions: {
        showAdvertisingPosters: {
            type: Boolean,
            default: true
        },
        showRankingTable: {
            type: Boolean,
            default: false
        }
    },
    feedbackOptions: {
        enableFeedback: {
            type: Boolean,
            default: true
        }
    }
});

mongoose.model('MainSettings', MainSettingsSchema);