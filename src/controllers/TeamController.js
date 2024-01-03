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
        viewTitle: 'Insert Team'
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
    team.goals = req.body.goals;
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
            group: req.body.group,
            goals: req.body.goals
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
      res.render('layouts/teamlist', {
            list: Teams
        });


    } catch (err) {
      console.log('Error in retrieval: ' + err);
    }
  });


  router.get('/:id', isAdmin, async (req, res) => {     //Create ans Update Team only for Admins
    try {
        const team = await Team.findById(req.params.id).exec();
        if (team) {
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
        const deletedStudent = await Team.findByIdAndDelete(req.params.id).exec();
        
        if (deletedStudent) {
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

// return the team name based on the id
router.get('/getTeamName/:id', async (req, res) => {
    const team = await Team.findById(req.params.id).exec();
    if (team) {
        // return status 200 and the team name
        res.status(200).send(team.name);
    } else {
        // Handle scenario where the team with the given ID wasn't found
        res.status(404).send('Team not found');
    }
    try {

    } catch (err) {
        console.log('Error: ' + err);
        // Handle the error, maybe render an error page
        res.status(500).send('Internal Server Error');
    }
});



module.exports = router;