const express = require('express');
var router = express.Router();

const mongoose = require('mongoose');
const Team = mongoose.model('Team');


router.get('/', (req,res) => {
    res.render('layouts/team_addOrEdit', {
        viewTitle: 'Insert Team'
    });

});


router.post('/', (req, res) => {
    console.log("Empfangen " + req)
    if(req.body._id == ''){
        insertRecord(req,res);
    }
    else{
        updateRecord(req,res);
    }
})

async function insertRecord(req, res) {
    var team = new Team();
    team.name = req.body.teamName;
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
        const updatedTeam = await Team.findOneAndUpdate({ _id: req.body._id }, req.body,{ new: true }).exec();

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


  router.get('/:id', async (req, res) => {
    try {
        const team = await Team.findById(req.params.id).exec();
        if (team) {
            res.render('layouts/team_addOrEdit', {
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


router.get('/delete/:id', async (req, res) => {
    try {
        const deletedStudent = await Team.findByIdAndDelete(req.params.id).exec();
        
        if (deletedStudent) {
            res.redirect('layouts/teamlist');
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



module.exports = router;







// // here we should create the connection to MongoDB
// teams = [];

// // write a function that adds a new team to the database
// function addTeam(name) {
//     const team = new Team(name);
//     teams.push(team);
//     return team;
// }

// // return all teams
// function getAllTeams() {
//     return teams;
// }

// function getTeamStats(teamName) {
//     // find team stats in Schedule DB and return the current points
// }