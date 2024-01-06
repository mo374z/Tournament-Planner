const express = require('express');
var router = express.Router();

const mongoose = require('mongoose');
const Team = mongoose.model('Team');


//Code part to enable the authentication for all the following routes
const  {verifyToken, checkLoginStatus , isAdmin}=  require('../middleware/auth'); // Pfad zur auth.js-Datei
const cookieParser = require('cookie-parser'); 
router.use(cookieParser());                 // Add cookie-parser middleware to parse cookies

router.use(verifyToken);                    // Alle nachfolgenden Routen sind nur für angemeldete Benutzer zugänglich
router.use((req, res, next) => {            // Middleware, um Benutzerinformationen an res.locals anzuhängen
    res.locals.username = req.username;
    res.locals.userrole = req.userRole;
    next();
  });
//--------------------------------------------------------------



router.get('/', (req,res) => {
    res.render('layouts/createUpdateTeam', {
        viewTitle: 'Insert Team',
        isNew: true,
    });

});


router.post('/', (req, res) => {
    console.log("Empfangen " + req);
    if(req.body._id == ''){
        console.log("insertRecord");
        insertRecord(req,res);
    }
    else{
        console.log("updateRecord ");
        updateRecord(req,res);
    }
})

async function insertRecord(req, res) {
    var team = new Team();
    team.name = req.body.name;
    team.group = req.body.group;
    team.gamesPlayed = 0;
    team.gamesWon = 0;
    team.gamesLost = 0;
    team.gamesDraw = 0;
    team.goals = [0,0];    
    team.sektWon = 0;
    team.points = 0;

    try {
        const doc = await team.save();
        res.redirect('team/list');
    } catch (err) {
        console.log('Error during insert: ' + err);
        // Handle the error here, maybe send an error response or render an error page
    }
}


async function updateRecord(req, res) {
    try {
        const teamId = req.body._id;
        const updatedData = {
            name: req.body.name,
        };

        const updatedTeam = await Team.findOneAndUpdate({ _id: teamId }, updatedData, { new: true }).exec();
        if (updatedTeam) {
            res.redirect('team/list');
        } else {
            // Handle scenario where the team with the given ID wasn't found
            res.status(404).send('Team not found');
        }
    } catch (err) {
        console.log('Error during update: ' + err);
        // Handle the error, maybe render an error page
        res.status(500).send('Internal Server Error');
    }
}





router.get('/list', async (req, res) => {

    try {
      const Teams = await Team.find({ });
      
        Teams.forEach(team => {                 //calculate goals difference
            team.goalsDifference = team.goals[0] - team.goals[1];
        });

      res.render('layouts/teamlist', {
            list: Teams,

        });


    } catch (err) {
      console.log('Error in retrieval: ' + err);
    }
  });


  
router.get('/clearTeamCounters', isAdmin, async (req, res) => {   //Clear Team Counters only for Admins
    try {
        const teams = await Team.find({}).exec();
        teams.forEach(async team => {
            team.gamesPlayed = 0;
            team.gamesWon = 0;
            team.gamesLost = 0;
            team.gamesDraw = 0;
            team.goals = [0,0];    
            team.sektWon = 0;
            team.points = 0;
            await team.save();
        });
        res.redirect('/team/list');
    } catch (err) {
        console.log('Error in deletion: ' + err);
        // Handle the error, maybe render an error page
        res.status(500).send('Internal Server Error');
    }
});


  router.get('/:id', isAdmin, async (req, res) => {     //Create and Update Team only for Admins
    try {
        const team = await Team.findById(req.params.id).exec();
        if (team) {                                                             // If the team was found
            res.render('layouts/createUpdateTeam', {
                viewTitle: "Update Team With id: " + req.params.id + " !",
                team: team,
            });
            console.log(team);
        } else {
            // Handle scenario where the team with the given ID wasn't found
            res.status(404).send('Team not found');
        }
    } catch (err) {
        console.log('Error: ' + err);
        // Handle the error, maybe render an error page
        res.status(500).send('Internal Server Error');
    }
});


router.get('/delete/:id' , isAdmin, async (req, res) => {   //Delete Team only for Admins
    try {
        const deletedTeam = await Team.findByIdAndDelete(req.params.id).exec();
        
        if (deletedTeam) {
            res.redirect('/team/list');
        } else {
            // Handle scenario where the student with the given ID wasn't found
            res.status(404).send('Student not found');
        }
    } catch (err) {
        console.log('Error in deletion: ' + err);
        // Handle the error, maybe render an error page
        res.status(500).send('Internal Server Error');
    }
});

// return the team ID based on the id
router.get('/getTeamName/:id', async (req, res) => {

    if(req.params.isDummy){
        res.status(200).send(req.params.name);
    }
    else{
        const team = await Team.findById(req.params.id).exec();

        if (team) {
            res.status(200).send(team.name);     // return the team name
        }
        else {
            // Handle scenario where the team with the given ID wasn't found
            res.status(404).send('Team not found');
        }

    }
    try {

    } catch (err) {
        console.log('Error: ' + err);
        // Handle the error, maybe render an error page
        res.status(500).send('Internal Server Error');
    }
});



module.exports = router;