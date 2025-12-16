const express = require('express');
var router = express.Router();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Game = mongoose.model('Game');
const Team = mongoose.model('Team');
const MainSettings = mongoose.model('MainSettings');
const { checkLoginStatus, authorizeRoles } = require('../middleware/auth');
const { updateSocketConfig } = require('../config/socketConfig');
const socketConfig = updateSocketConfig(process.argv.slice(2));
const { getRankedTeams } = require('../models/Team');
const Handlebars = require('handlebars');

const cookieParser = require('cookie-parser');
router.use(cookieParser());
router.use(checkLoginStatus);
router.use((req, res, next) => {
    res.locals.username = req.username;
    res.locals.userrole = req.userRole;
    next();
});

// Import the fetchGamesData function from the ScheduleController
const { fetchGamesData } = require('./ScheduleController');
const { getTeamsByGroup } = require('./TeamController');
const { getInfoBannerMessage } = require('./GameController');

router.get('/', (req, res) => {
    renderPublicPage(req, res);
});

router.get('/TV', authorizeRoles('admin', 'TV'), (req, res) => {
    renderTVPage(req, res);
});

async function renderPublicPage(req, res) {
    fetchGamesData().then(async ({ games, timeBetweenGames }) => {
        try {
            const teamsByGroup = await getTeamsByGroup();
            const infoBannerMessage = getInfoBannerMessage(); // Get the current info banner message
            const mainSettings = await MainSettings.findOne({}); // Fetch main settings

            const carouselImages = fs.readdirSync(path.join(__dirname, '../../public/images/carousel'))
                .filter(file => ['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(file.split('.').pop().toLowerCase()));

            let rankedTeams = [];
            if (mainSettings.publicPageOptions.showRankingTable) { // Check if the ranking table should be displayed
                rankedTeams = await getRankedTeams();
            }

            res.render('home', {
                gameslist: games,
                teamsByGroup,
                timeBetweenGames,
                infoBannerMessage, // Send the infoBannerMessage to the Public page
                carouselImages, // Send the carousel images to the Public page
                publicPageOptions: {
                    ...mainSettings.publicPageOptions,
                    feedbackOptions: mainSettings.feedbackOptions || { enableFeedback: true }
                }, // Send public page options to the Public page including feedback options
                rankedTeams // Send ranked teams to the Public page
            });

        } catch (err) {
            console.log('Error in retrieval: ' + err);
        }
    }).catch((error) => {
        console.log(error);
    });
}

async function renderTVPage(req, res) {
    fetchGamesData().then(async ({ games, timeBetweenGames }) => {
        try {
            const teamsByGroup = await getTeamsByGroup();
            const infoBannerMessage = getInfoBannerMessage(); // Get the current info banner message

            res.render('layouts/TVPage', {
                socketConfig: socketConfig,
                gameslist: games,
                teamsByGroup,
                timeBetweenGames,
                infoBannerMessage // Send the infoBannerMessage to the TV page
            });

        } catch (err) {
            console.log('Error in retrieval: ' + err);
        }
    }).catch((error) => {
        console.log(error);
    });
}

module.exports = router;