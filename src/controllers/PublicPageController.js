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
const session = require('express-session');
router.use(cookieParser());

// Session configuration for visitor tracking
router.use(session({
    secret: 'tournament-planner-visitor-tracking',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

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
            let mainSettings = await MainSettings.findOne({}); // Fetch main settings
            
            // Initialize visitor counters if they don't exist
            if (!mainSettings.visitorCounters) {
                mainSettings.visitorCounters = {
                    totalPageViews: 0,
                    uniqueVisitors: 0
                };
            }
            
            // Only track if this is an actual HTML page request (not favicon, images, etc.)
            const userAgent = req.get('User-Agent') || '';
            const acceptsHtml = req.accepts('html');
            const isPageRequest = acceptsHtml && !userAgent.toLowerCase().includes('bot') && !userAgent.toLowerCase().includes('crawler');
            
            if (isPageRequest && !req.session.pageViewCounted) {
                // Track visitor statistics
                mainSettings.visitorCounters.totalPageViews += 1;
                
                // Check if this is a new unique visitor (based on session)
                if (!req.session.hasVisited) {
                    mainSettings.visitorCounters.uniqueVisitors += 1;
                    req.session.hasVisited = true;
                }
                
                // Mark that we've counted this page view for this request
                req.session.pageViewCounted = true;
                
                // Save updated visitor counters
                await mainSettings.save();
            }
            
            // Initialize visitor counters if they don't exist
            if (!mainSettings.visitorCounters) {
                mainSettings.visitorCounters = {
                    totalPageViews: 0,
                    uniqueVisitors: 0
                };
            }
            
            // Track visitor statistics
            mainSettings.visitorCounters.totalPageViews += 1;
            
            // Check if this is a new unique visitor (based on session)
            if (!req.session.hasVisited) {
                mainSettings.visitorCounters.uniqueVisitors += 1;
                req.session.hasVisited = true;
            }
            
            // Save updated visitor counters
            await mainSettings.save();

            const carouselImages = fs.readdirSync(path.join(__dirname, '../../public/images/carousel'))
                .filter(file => ['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(file.split('.').pop().toLowerCase()));

            let rankedTeams = [];
            if (mainSettings.publicPageOptions.showRankingTable) { // Check if the ranking table should be displayed
                rankedTeams = await getRankedTeams();
            }

            // Get all teams for the filter dropdown sorted by name alphabetically
            const allTeams = await Team.find({}).sort({ name: 1 });

            res.render('home', {
                gameslist: games,
                teamsByGroup,
                timeBetweenGames,
                infoBannerMessage, // Send the infoBannerMessage to the Public page
                carouselImages, // Send the carousel images to the Public page
                publicPageOptions: {
                    ...mainSettings.publicPageOptions,
                    feedbackOptions: mainSettings.feedbackOptions || { enableFeedback: true },
                    visitorCounters: mainSettings.visitorCounters || { totalPageViews: 0, uniqueVisitors: 0 }
                }, // Send public page options to the Public page including feedback and visitor options
                rankedTeams, // Send ranked teams to the Public page
                allTeams // Send all teams for the filter dropdown
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