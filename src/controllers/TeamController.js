const express = require('express');
var router = express.Router();

const mongoose = require('mongoose');
const Team = mongoose.model('Team');


//Code part to enable the authentication for all the following routes
const  {verifyToken, checkLoginStatus , isAdmin}=  require('../middleware/auth'); // Pfad zur auth.js-Datei
const cookieParser = require('cookie-parser'); 
const { get } = require('lodash');
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
    if(req.body._id == ''){
        insertRecord(req,res);
    }
    else{
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
    team.points_Group_Stage = 0;
    team.points_General = 0;
    team.gamesPlayed_Group_Stage = 0;

    try {
        const doc = await team.save();
        res.redirect('team/list');
    } catch (err) {
        console.log('Error during insert: ' + err);
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
            res.status(404).send('Team not found');
        }
    } catch (err) {
        console.log('Error during update: ' + err);
        res.status(500).send('Internal Server Error');
    }
}


router.get('/list', async (req, res) => {
    try {
      const Teams = await Team.find({ });
      
        Teams.forEach(team => {
            team.goalsDifference = team.goals[0] - team.goals[1];
            team.rank = getRank(team);
        });

      res.render('layouts/teamlist', {
            list: Teams,
        });
    } catch (err) {
      console.log('Error in retrieval: ' + err);
    }
  });

  router.get('/grouplist', async (req, res) => {
    try {
        const teamsByGroup = await Team.aggregate([
            {
                $group: {
                    _id: "$group",
                    teams: {
                        $push: {
                            _id: "$_id",
                            name: "$name",
                            group: "$group",
                            rank: { $literal: null }, // Placeholder for rank
                            gamesPlayed_Group_Stage: "$gamesPlayed_Group_Stage",
                            points_Group_Stage: "$points_Group_Stage",
                            goalsDifference: {
                                $subtract: [
                                    { $arrayElemAt: ["$goals", 0] },
                                    { $arrayElemAt: ["$goals", 1] }  
                                ]
                            }
                        }
                    }
                }
            },
            {
                $project: {
                    groupName: "$_id",
                    teams: 1,
                    _id: 0
                }
            },
            {
                $sort: {
                    groupName: 1 // Sort by group name
                }
            }
        ]);

        await updateRanks(teamsByGroup);

        // Sort groups based on the first team's rank in each group
        teamsByGroup.sort((a, b) => {
            if (a.teams.length > 0 && b.teams.length > 0) {
                return a.teams[0].rank - b.teams[0].rank;
            }
            return 0;
        });

      res.render('layouts/grouplist', {
            teamsByGroup,
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
            team.points_Group_Stage = 0;
            team.points_General = 0;
            team.gamesPlayed_Group_Stage = 0;
            await team.save();
        });
        res.redirect('/team/list');
    } catch (err) {
        console.log('Error in deletion: ' + err);
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
        } else {
            res.status(404).send('Team not found');
        }
    } catch (err) {
        console.log('Error: ' + err);
        res.status(500).send('Internal Server Error');
    }
});


router.get('/delete/:id' , isAdmin, async (req, res) => {   //Delete Team only for Admins
    try {
        const deletedTeam = await Team.findByIdAndDelete(req.params.id).exec();
        if (deletedTeam) {
            res.redirect('/team/list');
        } else {
            res.status(404).send('Student not found');
        }
    } catch (err) {
        console.log('Error in deletion: ' + err);
        res.status(500).send('Internal Server Error');
    }
});

// return the team ID based on the id
router.get('/getTeamName/:id', async (req, res) => {
    try {
        if(req.params.isDummy){
            res.status(200).send(req.params.name);
        }
        else{
            const team = await Team.findById(req.params.id).exec();
    
            if (team) {
                res.status(200).send(team.name);     // return the team name
            }
            else {
                res.status(404).send('Team not found');
            }
    
        }
    } catch (err) {
        console.log('Error: ' + err);
        res.status(500).send('Internal Server Error');
    }
});

// return the current rank of the team within the group
// the rank is based on the points, goal difference, and goals scored (in this order)
router.get('/getTeamRank/:id', async (req, res) => {
    try {
        const team = await Team.findById(req.params.id).exec();

        if (team) {
            res.status(200).send({ rank: getRank(team)});
        } else {
            res.status(404).send('Team not found');
        }
    } catch (err) {
        console.log('Error: ' + err);
        res.status(500).send('Internal Server Error');
    }
});

async function getRank(team){
    const allTeamsInGroup = await Team.find({group: team.group}).exec();

    // Sort teams based on points, goal difference, and goals scored
    const sortedTeams = allTeamsInGroup.sort((a, b) => {
        if (a.points_Group_Stage !== b.points_Group_Stage) {
            return b.points_Group_Stage - a.points_Group_Stage;
        } else {
            const goalDifferenceA = a.goals[0] - a.goals[1];
            const goalDifferenceB = b.goals[0] - b.goals[1];

            if (goalDifferenceA !== goalDifferenceB) {
                return goalDifferenceB - goalDifferenceA;
            } else {
                return b.goals[0] - a.goals[0];
            }
        }
    });

    // Find the index of the current team in the sorted array to determine its rank
    const teamIndex = sortedTeams.findIndex(t => t._id.equals(team._id));
    return teamIndex + 1;
}

async function updateRanks(teamsByGroup) {
    for (const group of teamsByGroup) {
        for (const team of group.teams) {
            team.rank = await getRank(team);
        }

        // Sort teams within the group based on rank
        group.teams.sort((a, b) => a.rank - b.rank);
    }
}



module.exports = router;