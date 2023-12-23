const express = require('express');
var router = express.Router();

const mongoose = require('mongoose');
const MainSettings = mongoose.model('MainSettings');

const defaultStartTime = new Date('2021-06-11T21:00:00.000Z');
const defaultTimeBetweenGames = 2 * 60 * 1000; 
const defaultGameDurationGroupStage = 10 * 60 * 1000; 
const defaultGameDurationQuarterfinals = 15 * 60 * 1000;

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
                // Add other default values if needed
            });

            // Save the default MainSettings to the database
            await mainSettings.save();
        }

        // Render the edit page with the MainSettings data
        res.render('layouts/editMainSettings', { mainSettings });
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
            gameDurationQuarterfinalsInMin
            // Add other fields if needed
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
                // Add other default values if needed
            });

            // Save the default MainSettings to the database
            await mainSettings.save();
        }

        mainSettings.TornamentStartTime = TornamentStartTime;
        mainSettings.timeBetweenGames = timeBetweenGames;
        mainSettings.gameDurationGroupStage = gameDurationGroupStage;
        mainSettings.gameDurationQuarterfinals = gameDurationQuarterfinals;

        // Save the updated MainSettings
        await mainSettings.save();

        res.redirect('/team/list'); // Redirect to the main settings page
    } catch (err) {
        console.error('Error updating MainSettings:', err);
        res.status(500).send('Internal Server Error');
    }
});


module.exports = router;