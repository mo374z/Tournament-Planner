const express = require("express");
var router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Team = mongoose.model('Team');
const Game = mongoose.model('Game');
const Player = mongoose.model('Player');
const MainSettings = mongoose.model('MainSettings');
const cookieParser = require('cookie-parser');
const { checkLoginStatus } = require('../middleware/auth');

// Import helper functions from TeamController
const TeamController = require('./TeamController');

router.use(cookieParser());

// MyTeam Login Page
router.get("/login", checkLoginStatus, async (req, res) => {
  try {
    // Check if MyTeam functionality is enabled
    const mainSettings = await MainSettings.findOne({});
    if (!mainSettings || !mainSettings.myTeamEnabled) {
      return res.status(404).render("layouts/error", {
        message: "MyTeam Bereich ist derzeit nicht verfügbar."
      });
    }

    const isAdmin = req.userRole === 'admin';
    const teams = isAdmin ? await Team.find({}).select('name _id').exec() : [];
    
    res.render("layouts/myTeamLogin", {
      teams: teams,
      isAdmin: isAdmin
    });
  } catch (err) {
    console.log("Error loading MyTeam login: " + err);
    res.status(500).send("Internal Server Error");
  }
});

// MyTeam Login Authentication
router.post("/login", checkLoginStatus, async (req, res) => {
  try {
    const { teamId, accessCode } = req.body;
    const isAdmin = req.userRole === 'admin';
    const teams = isAdmin ? await Team.find({}).select('name _id').exec() : [];
    
    if (isAdmin) {
      // Admin login - can use either team selection OR access code
      if (accessCode) {
        // Admin wants to test normal login with access code
        const allTeams = await Team.find({}).exec();
        let matchingTeam = null;

        for (const team of allTeams) {
          if (team.accessCodeHash) {
            const isValidCode = await bcrypt.compare(accessCode, team.accessCodeHash);
            if (isValidCode) {
              matchingTeam = team;
              break;
            }
          }
        }

        if (!matchingTeam) {
          return res.render("layouts/myTeamLogin", {
            teams: teams,
            isAdmin: true,
            error: "Ungültiger Zugangscode."
          });
        }

        // Set team session cookie using found team
        res.cookie('myTeamId', matchingTeam._id.toString(), {
          httpOnly: true,
          maxAge: 30 * 60 * 1000 // 30 minutes
        });

        res.redirect('/myteam/dashboard');
      } else if (teamId) {
        // Admin uses team selection without code
        const team = await Team.findById(teamId).exec();
        if (!team) {
          return res.render("layouts/myTeamLogin", {
            teams: teams,
            isAdmin: true,
            error: "Team nicht gefunden."
          });
        }

        // Set team session cookie for admin
        res.cookie('myTeamId', teamId, {
          httpOnly: true,
          maxAge: 30 * 60 * 1000 // 30 minutes
        });

        res.redirect('/myteam/dashboard');
      } else {
        return res.render("layouts/myTeamLogin", {
          teams: teams,
          isAdmin: true,
          error: "Bitte wählen Sie ein Team aus oder geben Sie einen Zugangscode ein."
        });
      }
    } else {
      // Regular user login - only access code required, find team automatically
      if (!accessCode) {
        return res.render("layouts/myTeamLogin", {
          teams: teams,
          isAdmin: false,
          error: "Bitte geben Sie den Zugangscode ein."
        });
      }

      // Find team by matching access code
      const allTeams = await Team.find({}).exec();
      let matchingTeam = null;

      for (const team of allTeams) {
        if (team.accessCodeHash) {
          const isValidCode = await bcrypt.compare(accessCode, team.accessCodeHash);
          if (isValidCode) {
            matchingTeam = team;
            break;
          }
        }
      }

      if (!matchingTeam) {
        return res.render("layouts/myTeamLogin", {
          teams: teams,
          isAdmin: false,
          error: "Ungültiger Zugangscode."
        });
      }

      // Set team session cookie
      res.cookie('myTeamId', matchingTeam._id.toString(), {
        httpOnly: true,
        maxAge: 30 * 60 * 1000 // 30 minutes
      });

      res.redirect('/myteam/dashboard');
    }
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

    // Get players for this team
    const players = await Player.find({ team: team._id }).exec();

    if(team.imagePath === undefined || team.imagePath === null){
      team.imagePath = '/teampictures/default.jpg';
    }

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
        logo: team.logo || {}
    };

    res.render("layouts/myTeamDashboard", {
      team: teamView,
      upcomingGames: upcomingGames,
      pastGames: pastGames,
      players: players,
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