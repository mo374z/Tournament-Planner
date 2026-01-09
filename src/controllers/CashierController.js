const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Team = mongoose.model('Team');

// Middleware to check if user is logged in
const { verifyToken, authorizeRoles, checkLoginStatus } = require('../middleware/auth');
const cookieParser = require('cookie-parser');

// GET Kassier-Seite für Getränkebestellung
router.get('/order', cookieParser(), verifyToken, authorizeRoles('admin'), async (req, res) => {
    try {
        res.locals.username = req.username;
        res.locals.userrole = req.userRole;
        
        const teams = await Team.find({}).sort({ name: 1 });
        
        res.render('layouts/cashierPage', {
            teams: teams,
            title: 'Getränkebestellung'
        });
    } catch (err) {
        console.error('Error loading cashier page:', err);
        res.status(500).send('Server Error');
    }
});

// POST Route zum Aktualisieren des Bier-Counts
router.post('/update-beer', cookieParser(), verifyToken, authorizeRoles('admin'), async (req, res) => {
    try {
        const { teamId, count } = req.body;
        
        if (!teamId || count === undefined) {
            return res.status(400).json({ success: false, message: 'Team ID und Count erforderlich' });
        }

        const team = await Team.findById(teamId);
        
        if (!team) {
            return res.status(404).json({ success: false, message: 'Team nicht gefunden' });
        }

        team.beerCount = (team.beerCount || 0) + parseInt(count);
        
        if (team.beerCount < 0) {
            team.beerCount = 0;
        }
        
        await team.save();

        // Emit socket event für Live-Updates
        if (global.io) {
            global.io.emit('beerCountUpdated', {
                teamId: team._id,
                teamName: team.name,
                beerCount: team.beerCount
            });
        }

        res.json({ 
            success: true, 
            message: 'Bier-Count aktualisiert',
            newCount: team.beerCount
        });
    } catch (err) {
        console.error('Error updating beer count:', err);
        res.status(500).json({ success: false, message: 'Server Fehler' });
    }
});

// GET Route für das Bier-Ranking
router.get('/ranking', async (req, res) => {
    try {
        // Top 5 Teams mit dem höchsten Bier-Count (für Liste)
        const teams = await Team.find({})
            .sort({ beerCount: -1 })
            .limit(5);
        
        // Top 3 für Balkendiagramm
        const topThree = teams.slice(0, 3);
        
        res.render('layouts/beerRanking', {
            teams: teams,            topThree: topThree,            title: 'Bier-Ranking'
        });
    } catch (err) {
        console.error('Error loading beer ranking:', err);
        res.status(500).send('Server Error');
    }
});

// API Route für Live-Ranking-Daten
router.get('/api/ranking', async (req, res) => {
    try {
        const teams = await Team.find({})
            .sort({ beerCount: -1 })
            .limit(5)
            .select('name beerCount');
        
        const topThree = teams.slice(0, 3);
        
        res.json({ success: true, teams: teams, topThree: topThree });
    } catch (err) {
        console.error('Error fetching ranking data:', err);
        res.status(500).json({ success: false, message: 'Server Fehler' });
    }
});

module.exports = { router };
