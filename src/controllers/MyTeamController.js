const express = require("express");
var router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Team = mongoose.model('Team');
const Game = mongoose.model('Game');
const Player = mongoose.model('Player');
const MainSettings = mongoose.model('MainSettings');
const cookieParser = require('cookie-parser');

// Import helper functions from TeamController
const TeamController = require('./TeamController');

router.use(cookieParser());

// MyTeam Login Page
router.get("/login", async (req, res) => {
  try {
    // Check if MyTeam functionality is enabled
    const mainSettings = await MainSettings.findOne({});
    if (!mainSettings || !mainSettings.myTeamEnabled) {
      return res.status(404).render("layouts/error", {
        message: "MyTeam Bereich ist derzeit nicht verfügbar."
      });
    }

    const teams = await Team.find({}).select('name _id').exec();
    res.render("layouts/myTeamLogin", {
      teams: teams
    });
  } catch (err) {
    console.log("Error loading MyTeam login: " + err);
    res.status(500).send("Internal Server Error");
  }
});

// MyTeam Login Authentication
router.post("/login", async (req, res) => {
  try {
    const { teamId, accessCode } = req.body;
    
    if (!teamId || !accessCode) {
      return res.render("layouts/myTeamLogin", {
        teams: await Team.find({}).select('name _id').exec(),
        error: "Bitte wählen Sie ein Team und geben Sie den Zugangscode ein."
      });
    }

    const team = await Team.findById(teamId).exec();
    if (!team) {
      return res.render("layouts/myTeamLogin", {
        teams: await Team.find({}).select('name _id').exec(),
        error: "Team nicht gefunden."
      });
    }

    // Verify access code
    const isValidCode = await bcrypt.compare(accessCode, team.accessCodeHash);
    if (!isValidCode) {
      return res.render("layouts/myTeamLogin", {
        teams: await Team.find({}).select('name _id').exec(),
        error: "Ungültiger Zugangscode."
      });
    }

    // Set team session cookie
    res.cookie('myTeamId', teamId, {
      httpOnly: true,
      maxAge: 30 * 60 * 1000 // 30 minutes
    });

    res.redirect('/myteam/dashboard');
  } catch (err) {
    console.log("Error during MyTeam authentication: " + err);
    res.status(500).send("Internal Server Error");
  }
});

// MyTeam Dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const teamId = req.cookies.myTeamId;
    if (!teamId) {
      return res.redirect('/myteam/login');
    }

    // Check if MyTeam functionality is enabled
    const mainSettings = await MainSettings.findOne({});
    if (!mainSettings || !mainSettings.myTeamEnabled) {
      return res.status(404).render("layouts/error", {
        message: "Der MyTeam Bereich ist derzeit nicht verfügbar."
      });
    }

    const team = await Team.findById(teamId).exec();
    if (!team) {
      return res.redirect('/myteam/login');
    }

    // Get upcoming games using TeamController function
    const upcomingGames = await TeamController.getUpcomingGamesForTeam(team._id);
    
    // Get past games using TeamController function
    const pastGames = await TeamController.getPastGamesForTeam(team._id);


    //create own team object to pass to the view to have control over what information is gets passed
    const teamView = {
        group: team.group,
        gamesPlayed: team.gamesPlayed,
        gamesWon: team.gamesWon,
        gamesDraw: team.gamesDraw,
        gamesLost: team.gamesLost,
        sektWon: team.sektWon,
        goals: team.goals,
        name: team.name,
        imagePath: team.imagePath,
        logo: team.logo
    };

    res.render("layouts/myTeamDashboard", {
      team: teamView,
      upcomingGames: upcomingGames,
      pastGames: pastGames,
      viewTitle: `MyTeam: ${team.name}`
    });
  } catch (err) {
    console.log("Error loading MyTeam dashboard: " + err);
    res.status(500).send("Internal Server Error");
  }
});

// Logout
router.get("/logout", (req, res) => {
  res.clearCookie('myTeamId');
  res.redirect('/myteam/login');
});

module.exports = router;