const express = require('express');
var router = express.Router();

const mongoose = require('mongoose');
const Game = mongoose.model('Game');
const Team = mongoose.model('Team');

const MainSettings = mongoose.model('MainSettings');

module.exports = router;

const {verifyToken, checkLoginStatus , isAdmin} =  require('../middleware/auth');
const {updateSocketConfig} = require('../config/socketConfig');
const socketConfig = updateSocketConfig(process.argv.slice(2));

const cookieParser = require('cookie-parser');
router.use(cookieParser());                 // Add cookie-parser middleware to parse cookies

router.use(checkLoginStatus);                 // Add checkLoginStatus middleware to check login status
router.use((req, res, next) => {            // Middleware, um Benutzerinformationen an res.locals anzuhängen
    res.locals.username = req.username;
    res.locals.userrole = req.userRole;
    next();
  });
//--------------------------------------------------------------


//import the fetchGamesData function from the ScheduleController
const {fetchGamesData} = require('./ScheduleController');
const {getTeamsByGroup} = require('./TeamController');




router.get('/', (req, res) => {

    renderPublicPage(req, res);
    //res.render('home');

});


router.get('/TV', checkLoginStatus, (req, res) => {
    renderTVPage(req, res);
});





async function renderPublicPage(req, res) {

    fetchGamesData().then(async ({ games, timeBetweenGames }) => {


        try {
            const teamsByGroup = await getTeamsByGroup();

            res.render('home', {
                gameslist: games,
                teamsByGroup,
                timeBetweenGames,
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

            res.render('layouts/TVPage', {
                socketConfig: socketConfig,
                gameslist: games,
                teamsByGroup,
                timeBetweenGames,
            });

        } catch (err) {
            console.log('Error in retrieval: ' + err);
        }
        
        

    }).catch((error) => {
        console.log(error);
    });

    
}