const express = require("express");
var router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Team = mongoose.model('Team');
const Player = mongoose.model('Player');
const MainSettings = mongoose.model('MainSettings');
const cookieParser = require('cookie-parser');
const { checkLoginStatus } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Import helper functions from TeamController
const TeamController = require('./TeamController');

// Multer configuration for image upload
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, "public/teampictures/");
  },
  filename: function(req, file, cb) {
    cb(null, req.body.teamId + path.extname(file.originalname));
  },
});

// Multer configuration for logo upload
const logoStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, "public/teamlogos/");
  },
  filename: function(req, file, cb) {
    cb(null, req.body.teamId + "_logo" + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });
const uploadLogo = multer({ storage: logoStorage });

router.use(cookieParser());

// MyTeam Login Page
router.get("/login", checkLoginStatus, async (req, res) => {
  try {
    // Check if MyTeam functionality is enabled
    const mainSettings = await MainSettings.findOne({});
    if (!mainSettings || !mainSettings.myTeamPageOptions?.myTeamEnabled) {
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
          maxAge: 60 * 60 * 1000 // 60 minutes
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
    if (!mainSettings || !mainSettings.myTeamPageOptions?.myTeamEnabled) {
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

    //Sort the goals and opponents in the past games so that team is always opponent0 and goals[0] are their goals
    pastGames.forEach(game => {
      if (game.opponents[1].toString() === team._id.toString()) {
        // Swap opponents
        [game.opponents[0], game.opponents[1]] = [game.opponents[1], game.opponents[0]];
        // Swap goals
        [game.goals[0], game.goals[1]] = [game.goals[1], game.goals[0]];
      }
    });


    // Get players for this team
    const players = await Player.find({ team: team._id }).exec();

    if(team.imagePath === undefined || team.imagePath === null){
      team.imagePath = '/teampictures/default.jpg';
    }


    //Check if team has a final placement and if certificate download is allowed and disable if not
    if (team.finalPlacement !== null && mainSettings.myTeamPageOptions?.allowCertificateDownload) {
      //mainSettings.myTeamPageOptions.allowCertificateDownload = true;
    } else {
      mainSettings.myTeamPageOptions.allowCertificateDownload = false;
    }

    //create own team object to pass to the view to have control over what information is gets passed
    const teamView = {
        _id: team._id,
        group: team.group,
        gamesPlayed: team.gamesPlayed,
        gamesWon: team.gamesWon,
        gamesDraw: team.gamesDraw,
        gamesLost: team.gamesLost,
        sektWon: team.sektWon,
        goals: team.goals,
        name: team.name,
        imagePath: team.imagePath,
        logo: team.logo || {},
        _id: team._id // Add team ID for upload form
    };

    res.render("layouts/myTeamDashboard", {
      team: teamView,
      upcomingGames: upcomingGames,
      pastGames: pastGames,
      players: players,
      mainSettings: mainSettings, // Pass mainSettings to check upload permission
      viewTitle: `MyTeam: ${team.name}`
    });
  } catch (err) {
    console.log("Error loading MyTeam dashboard: " + err);
    res.status(500).send("Internal Server Error");
  }
});

// Upload team image for MyTeam users
router.post("/uploadImage", upload.single("teamImage"), async (req, res) => {
  try {
    const teamId = req.cookies.myTeamId;
    if (!teamId) {
      return res.redirect('/myteam/login');
    }

    // Check if image upload is enabled
    const mainSettings = await MainSettings.findOne({});
    if (!mainSettings || !mainSettings.myTeamPageOptions?.allowImageUpload) {
      return res.status(403).render("layouts/error", {
        message: "Bild-Upload ist nicht aktiviert."
      });
    }

    // Verify that the team in cookie matches the form teamId for security
    if (teamId !== req.body.teamId) {
      return res.status(403).render("layouts/error", {
        message: "Keine Berechtigung für dieses Team."
      });
    }

    const team = await Team.findById(teamId).exec();
    if (team) {
      team.imagePath = "/teampictures/" + req.file.filename;
      await team.save();
      console.log("Image uploaded successfully by team:", team.name);
      res.redirect("/myteam/dashboard");
    } else {
      console.log("Team not found for ID:", teamId);
      res.status(404).send("Team not found");
    }
  } catch (err) {
    console.log("Error during MyTeam image upload:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Upload team logo for MyTeam users
router.post("/uploadLogo", uploadLogo.single("teamLogo"), async (req, res) => {
  try {
    const teamId = req.cookies.myTeamId;
    if (!teamId) {
      return res.redirect('/myteam/login');
    }

    // Check if logo upload is enabled
    const mainSettings = await MainSettings.findOne({});
    if (!mainSettings || !mainSettings.myTeamPageOptions?.allowLogoUpload) {
      return res.status(403).render("layouts/error", {
        message: "Logo-Upload ist nicht aktiviert."
      });
    }

    // Verify that the team in cookie matches the form teamId for security
    if (teamId !== req.body.teamId) {
      return res.status(403).render("layouts/error", {
        message: "Keine Berechtigung für dieses Team."
      });
    }

    const team = await Team.findById(teamId).exec();
    if (team) {
      if (!team.logo) {
        team.logo = {
          position: { x: 0.5, y: 0.5 },
          scale: 0.5,
          backgroundColor: '#f8f9fa'
        };
      }
      team.logo.path = "/teamlogos/" + req.file.filename;
      await team.save();
      console.log("MyTeam logo uploaded successfully:", req.file.filename);
      res.redirect('/myteam/dashboard');
    } else {
      console.log("Team not found for ID:", teamId);
      res.status(404).render("layouts/error", { message: "Team nicht gefunden." });
    }
  } catch (err) {
    console.log("Error during MyTeam logo upload:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Save logo position for MyTeam users
router.post('/saveLogoPosition', async (req, res) => {
  try {
    const teamId = req.cookies.myTeamId;
    if (!teamId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    // Check if logo upload is enabled
    const mainSettings = await MainSettings.findOne({});
    if (!mainSettings || !mainSettings.myTeamPageOptions?.allowLogoUpload) {
      return res.status(403).json({ success: false, message: 'Logo-Bearbeitung ist nicht aktiviert' });
    }

    const { x, y, scale, backgroundColor } = req.body;
    
    // Validierung für normalisierte Positionswerte
    if (typeof x !== 'number' || x < 0 || x > 1) {
      return res.status(400).json({ success: false, message: 'X-Position muss zwischen 0 und 1 liegen' });
    }
    if (typeof y !== 'number' || y < 0 || y > 1) {
      return res.status(400).json({ success: false, message: 'Y-Position muss zwischen 0 und 1 liegen' });
    }
    
    const team = await Team.findById(teamId).exec();
    if (team) {
      if (!team.logo) {
        team.logo = {};
      }
      
      // Speichere normalisierte Werte direkt
      team.logo.position = { x: x, y: y };
      team.logo.scale = scale;
      if (backgroundColor) {
        team.logo.backgroundColor = backgroundColor;
      }
      
      await team.save();
      console.log('MyTeam logo settings saved successfully');
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, message: 'Team not found' });
    }
  } catch (err) {
    console.log('Error during MyTeam logo settings save:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Add new player for MyTeam users
router.post('/addPlayer', async (req, res) => {
  try {
    const teamId = req.cookies.myTeamId;
    if (!teamId) {
      return res.status(401).json({ success: false, message: 'Nicht angemeldet' });
    }

    // Check if player add is enabled
    const mainSettings = await MainSettings.findOne({});
    if (!mainSettings || !mainSettings.myTeamPageOptions?.allowPlayerAdd) {
      return res.status(403).json({ success: false, message: 'Spieler hinzufügen ist nicht aktiviert.' });
    }

    const { name, number } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Name ist erforderlich.' });
    }

    const team = await Team.findById(teamId).exec();
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team nicht gefunden.' });
    }

    // Check if player name already exists in this team
    const existingPlayer = await Player.findOne({ 
      team: teamId, 
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
    }).exec();
    
    if (existingPlayer) {
      return res.status(400).json({ success: false, message: 'Ein Spieler mit diesem Namen existiert bereits in diesem Team.' });
    }

    // Check if number is provided and already exists in this team
    if (number && number.toString().trim().length > 0) {
      const existingNumber = await Player.findOne({ 
        team: teamId, 
        number: number.toString().trim() 
      }).exec();
      
      if (existingNumber) {
        return res.status(400).json({ success: false, message: 'Ein Spieler mit dieser Nummer existiert bereits in diesem Team.' });
      }
    }

    // Create new player
    const newPlayer = new Player({
      name: name.trim(),
      number: number && number.toString().trim().length > 0 ? number.toString().trim() : undefined,
      team: teamId,
      total_goals: 0,
      goals: []
    });

    await newPlayer.save();
    console.log('Player added successfully by team:', team.name, 'Player:', newPlayer.name);
    
    res.json({ success: true, message: 'Spieler erfolgreich hinzugefügt!' });
  } catch (err) {
    console.log('Error during MyTeam player add:', err);
    res.status(500).json({ success: false, message: 'Interner Server Fehler' });
  }
});

router.get('/downloadCertificate', async (req, res) => {
  try {
    const teamId = req.cookies.myTeamId;
    if (!teamId) return res.redirect('/myteam/login');

    const mainSettings = await MainSettings.findOne({});
    if (!mainSettings?.myTeamPageOptions?.allowCertificateDownload) {
      return res.status(403).render("layouts/error", { message: "Urkunden-Download ist nicht aktiviert." });
    }

    const team = await Team.findById(teamId).exec();
    if (!team) return res.status(404).render("layouts/error", { message: "Team nicht gefunden." });

    const { generateCertificatePdf } = require('./CertificateController');
    
    const certificatesDir = path.join(__dirname, '../../public/certificates/');
    if (!fs.existsSync(certificatesDir)) fs.mkdirSync(certificatesDir, { recursive: true });

    const sanitizedName = `${team.finalPlacement}_${team.name}_certificate`
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/^\.+/, '_')
      .replace(/\.+$/, '');

    const pdfPath = path.join(certificatesDir, `${sanitizedName}.pdf`);
    
    await generateCertificatePdf(team, pdfPath);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${sanitizedName}.pdf"`);
    res.sendFile(pdfPath, () => {
      setTimeout(() => fs.existsSync(pdfPath) && fs.unlinkSync(pdfPath), 5000);
    });
  } catch (err) {
    console.error('Error during certificate download:', err);
    const message = err.message.includes('Template not found') 
      ? "Urkundenvorlage nicht gefunden. Bitte kontaktieren Sie den Administrator."
      : "Fehler beim Generieren der Urkunde.";
    res.status(err.message.includes('Template not found') ? 404 : 500).render("layouts/error", { message });
  }
});

// Logout
router.get("/logout", (req, res) => {
  res.clearCookie('myTeamId');
  res.redirect('/myteam/login');
});

module.exports = router;