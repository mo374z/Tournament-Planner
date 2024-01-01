const express = require('express');
var router = express.Router();

const mongoose = require('mongoose');
const MainSettings = mongoose.model('MainSettings');

const genCounters = mongoose.model('generalCounters');

const defaultStartTime = new Date('2021-06-11T21:00:00.000Z');
const defaultTimeBetweenGames = 2 * 60 * 1000; 
const defaultGameDurationGroupStage = 10 * 60 * 1000; 
const defaultGameDurationQuarterfinals = 15 * 60 * 1000;
const defaultgoalsforSekt = 10;


//Code part to enable the authentication for all the following routes
const  {verifyToken, checkLoginStatus , isAdmin} =  require('../middleware/auth'); // Pfad zur auth.js-Datei
const cookieParser = require('cookie-parser'); 
router.use(cookieParser());                 // Add cookie-parser middleware to parse cookies

router.use(verifyToken);                    // Alle nachfolgenden Routen sind nur für angemeldete Benutzer zugänglich
router.use((req, res, next) => {            // Middleware, um Benutzerinformationen an res.locals anzuhängen
    res.locals.username = req.username;
    res.locals.userrole = req.userRole;
    next();
  });

  router.use(isAdmin);                       // Alle nachfolgenden Routen sind nur für Admins zugänglich
//--------------------------------------------------------------



// GET route to fetch MainSettings data and render the edit page
router.get('/', async (req, res) => {
    try {
        // Fetch the MainSettings data from the database
        let mainSettings = await MainSettings.findOne({});

        // If no MainSettings data found, create a new MainSettings with default values
        if (!mainSettings) {
            mainSettings = new MainSettings({
                TornamentStartTime: defaultStartTime,
                timeBetweenGames: defaultTimeBetweenGames,
                gameDurationGroupStage: defaultGameDurationGroupStage,
                gameDurationQuarterfinals: defaultGameDurationQuarterfinals,
                goalsforSekt: defaultgoalsforSekt,
                // Add other default values if needed
            });

            // Save the default MainSettings to the database
            await mainSettings.save();
        }

        

        let generalCounters = await genCounters.findOne({});
        if (!generalCounters) {
            generalCounters = new generalCounters({
                allGoals: 0,
                gamesPlayed: 0,
                goalSektCounter: 0,
            });
            await generalCounters.save();
        }

        // Render the edit page with the MainSettings data
        res.render('layouts/editMainSettings', { mainSettings, generalCounters });
    } catch (err) {
        console.error('Error fetching MainSettings data:', err);
        res.status(500).send('Internal Server Error');
    }
});


// POST route to handle form submission and update MainSettings
router.post('/', async (req, res) => {
    try {
        const {
            TornamentStartTime,
            timeBetweenGamesInMin,
            gameDurationGroupStageInMin,
            gameDurationQuarterfinalsInMin,
            goalsforSekt
        } = req.body;

        // Convert minutes to milliseconds
        const timeBetweenGames = parseInt(timeBetweenGamesInMin) * 60 * 1000; // minutes to milliseconds
        const gameDurationGroupStage = parseInt(gameDurationGroupStageInMin) * 60 * 1000; // minutes to milliseconds
        const gameDurationQuarterfinals = parseInt(gameDurationQuarterfinalsInMin) * 60 * 1000; // minutes to milliseconds

        // Find the MainSettings document and update its values
        const mainSettings = await MainSettings.findOne({});

        // If no MainSettings data found, create a new MainSettings with default values
        if (!mainSettings) {
            mainSettings = new MainSettings({
                TornamentStartTime: defaultStartTime,
                timeBetweenGames: defaultTimeBetweenGames,
                gameDurationGroupStage: defaultGameDurationGroupStage,
                gameDurationQuarterfinals: defaultGameDurationQuarterfinals,
                goalsforSekt: defaultgoalsforSekt,
            });
        }

        mainSettings.TornamentStartTime = TornamentStartTime;
        mainSettings.timeBetweenGames = timeBetweenGames;
        mainSettings.gameDurationGroupStage = gameDurationGroupStage;
        mainSettings.gameDurationQuarterfinals = gameDurationQuarterfinals;
        mainSettings.goalsforSekt = goalsforSekt;

        // Save the updated MainSettings
        await mainSettings.save();

        // Redirect to the main settings page after resetting counters
        res.redirect('/');
    } catch (err) {
        console.error('Error updating MainSettings:', err);
        res.status(500).send('Internal Server Error');
    }
});



// POST route to reset general counters /mainSettings/resetCounters
router.get('/resetCounters', async (req, res) => {
    try {
        // Find and update general counters to reset them to zero
        const updatedCounters = await genCounters.findOneAndUpdate({}, {
            allGoals: 0,
            gamesPlayed: 0,
            goalSektCounter: 0,
            // Add other fields and their reset values if needed
        }, { new: true });

        // Redirect to the main settings page after resetting counters
        res.redirect('/mainSettings');
    } catch (err) {
        console.error('Error resetting counters:', err);
        res.status(500).send('Internal Server Error');
    }
});


module.exports = router;