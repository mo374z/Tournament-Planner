const express = require('express');
var router = express.Router();
const mongoose = require('mongoose');
const MainSettings = mongoose.model('MainSettings');
const genCounters = mongoose.model('generalCounters');
const { commonMiddleware } = require('../middleware/auth');

commonMiddleware(router, ['admin']); // Only admins can access the main settings page

const defaultStartTime = new Date('2024-01-20T08:00:00.000Z'); //in unserer Zeitzone: 20.01.2024 09:00 Uhr
const defaultTimeBetweenGames = 2 * 60 * 1000; 
const defaultGameDurationGroupStage = 8 * 60 * 1000; 
const defaultGameDurationQuarterfinals = 10 * 60 * 1000;
const defaultGameDurationSemiFinals = 10 * 60 * 1000;
const defaultGameDurationFinal = 10 * 60 * 1000;
const defaultTimeBetweenGamePhases = 5 * 60 * 1000;
const defaultgoalsforSekt = 10;


const { listDbs, listBackups } = require('../models/db'); // Import the listDbs function from the db.js file

function createDefaultMainSettings() {
    return new MainSettings({
        TornamentStartTime: defaultStartTime,
        timeBetweenGames: defaultTimeBetweenGames,
        gameDurationGroupStage: defaultGameDurationGroupStage,
        gameDurationQuarterfinals: defaultGameDurationQuarterfinals,
        gameDurationSemifinals: defaultGameDurationSemiFinals,
        gameDurationFinal: defaultGameDurationFinal,
        timeBetweenGamePhases: defaultTimeBetweenGamePhases,
        goalsforSekt: defaultgoalsforSekt,
        groups: []
    });
}

// GET route to fetch MainSettings data and render the edit page
router.get('/', async (req, res) => {
    try {
        // Fetch the MainSettings data from the database
        let mainSettings = await MainSettings.findOne({});

        // If no MainSettings data found, create a new MainSettings with default values
        if (!mainSettings) {
            mainSettings = createDefaultMainSettings();
            await mainSettings.save();
            console.log('Default MainSettings created:', mainSettings);
        }

        

        let generalCounters = await genCounters.findOne({});
        if (!generalCounters) {
            generalCounters = new genCounters({
                allGoals: 0,
                gamesPlayed: 0,
                goalSektCounter: 0,
                wonSektBottles: 0,
            });
            await generalCounters.save();
        }

        
        const dbs = await listDbs();  // Get a list of all databases

        const dbName = mongoose.connection.db.databaseName;

        const backupDbs = listBackups();  // Get a list of all backup databases

        // Render the edit page with the MainSettings data
        res.render('layouts/editMainSettings', { mainSettings, generalCounters, dbs, dbName, backupDbs });
    } catch (err) {
        console.error('Error fetching MainSettings data:', err);
        res.status(500).send('Internal Server Error');
    }
});



const { createDb } = require('../models/db');

router.post('/createDb', async (req, res) => {      // Create a new database for the tournament
    try {
        const dbName = req.body.dbName;
        const dbs = await listDbs();
        if (dbs.some(db => db.name === dbName)) {
          res.status(400).send('A database with this name already exists');
        } else {
          await createDb(dbName);
          res.redirect('/mainSettings');
        }
      } catch (err) {
        console.error(err);
        res.status(500).send('Error creating database');
      }
    });


const { switchDb } = require('../models/db');
// Switch to a different database
router.post('/switchDb', async (req, res) => {      
    try {
        await switchDb(req.body.dbName);
        res.redirect('/mainSettings');
    } catch (err) {
        res.status(500).send('Error switching database');
    }
}); 

const { backupDb } = require('../models/db');

router.get('/backupDB', async (req, res) => {      // Backup the current database
    try {
        backupDb();
        setTimeout(() => {
            res.redirect('/mainSettings');
        }, 1000); // 1000 milliseconds (1 seconds) delay
        } catch (err) {
            console.error(err);
            res.status(500).send('Error backing up database');
        }
});

const { restoreDb } = require('../models/db');

router.post('/restoreDB', async (req, res) => {      // Restore the current database
    const DbName = req.body.dbRestoreName;
    try {
        restoreDb(DbName);
        setTimeout(() => {
            res.redirect('/mainSettings');
        }, 1000);
        } catch (err) {
            console.error(err);
            res.status(500).send('Error restoring database');
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
            gameDurationSemifinalsInMin,
            gameDurationFinalInMin,
            timeBetweenGamePhasesInMin,            
            goalsforSekt
        } = req.body;

        // Convert minutes to milliseconds
        const timeBetweenGames = parseInt(timeBetweenGamesInMin) * 60 * 1000; // minutes to milliseconds
        const gameDurationGroupStage = parseInt(gameDurationGroupStageInMin) * 60 * 1000; // minutes to milliseconds
        const gameDurationQuarterfinals = parseInt(gameDurationQuarterfinalsInMin) * 60 * 1000; // minutes to milliseconds
        const gameDurationSemifinals = parseInt(gameDurationSemifinalsInMin) * 60 * 1000; // minutes to milliseconds
        const gameDurationFinal = parseInt(gameDurationFinalInMin) * 60 * 1000; // minutes to milliseconds
        const timeBetweenGamePhases = parseInt(timeBetweenGamePhasesInMin) * 60 * 1000; // minutes to milliseconds

        // Find the MainSettings document and update its values
        const mainSettings = await MainSettings.findOne({});

        // If no MainSettings data found, create a new MainSettings with default values
        if (!mainSettings) {
            mainSettings = createDefaultMainSettings();
        }

        mainSettings.TornamentStartTime = TornamentStartTime;
        mainSettings.timeBetweenGames = timeBetweenGames;
        mainSettings.gameDurationGroupStage = gameDurationGroupStage;
        mainSettings.gameDurationQuarterfinals = gameDurationQuarterfinals;
        mainSettings.gameDurationSemifinals = gameDurationSemifinals;
        mainSettings.gameDurationFinal = gameDurationFinal;
        mainSettings.timeBetweenGamePhases = timeBetweenGamePhases;
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

        const mainSettings = await MainSettings.findOne({});

        // Find and update general counters to reset them to zero
        const updatedCounters = await genCounters.findOneAndUpdate({}, {
            allGoals: 0,
            gamesPlayed: 0,
            goalSektCounter: mainSettings.goalsforSekt,
            wonSektBottles: 0,
            // Add other fields and their reset values if needed
        }, { new: true });

        // Redirect to the main settings page after resetting counters
        res.redirect('/mainSettings');
    } catch (err) {
        console.error('Error resetting counters:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Route to add a new group
router.post('/addGroups', async (req, res) => {
    try {
        const { nGroups } = req.body;
        let mainSettings = await MainSettings.findOne({});
        if (!mainSettings) {
            mainSettings = createDefaultMainSettings();
        }
        // store nGroups in the main settings named as capital letters
        mainSettings.groups = [...mainSettings.groups, ...Array.from({ length: nGroups }, (_, i) => String.fromCharCode(65 + i))];
        await mainSettings.save();
        res.redirect('/mainSettings');
    } catch (err) {
        console.error('Error adding group:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Route to delete a group
router.post('/deleteGroup', async (req, res) => {
    try {
        const { groupName } = req.body;
        let mainSettings = await MainSettings.findOne({});
        if (mainSettings) {
            mainSettings.groups = mainSettings.groups.filter(group => group !== groupName);
            await mainSettings.save();
        }
        res.redirect('/mainSettings');
    } catch (err) {
        console.error('Error deleting group:', err);
        res.status(500).send('Internal Server Error');
    }
});


async function checkForMainSettings() {
    try {
        let mainSettings = await MainSettings.findOne({});
        if (!mainSettings) {
            const newMainSettings = createDefaultMainSettings();
            await newMainSettings.save();
            console.log('\x1b[32m%s\x1b[0m', 'MainSettings created !');
        }
        else {
            console.log('MainSettings exist !');
        }
    }
    catch (err) {
        console.error('Error checking for MainSettings:', err);
    }
}

//exort the router and the createMainSettings function
module.exports = {
    router,
    checkForMainSettings 
};