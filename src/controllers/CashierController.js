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
        
        // Alle Teams sortiert nach Gruppe und Name
        const teams = await Team.find({}).sort({ group: 1, name: 1 });
        
        // Gruppiere Teams
        const teamsByGroup = {};
        teams.forEach(team => {
            if (!teamsByGroup[team.group]) {
                teamsByGroup[team.group] = [];
            }
            teamsByGroup[team.group].push(team);
        });
        
        // Produkte mit Preisen
        const products = {
            drinks: [
                { id: 'wasser', name: 'Wasser', price: 1.50, points: 0 },
                { id: 'antialk', name: 'Antialk', price: 2.00, points: 0 },
                { id: 'weizen', name: 'Weizen (0,5l)', price: 3.50, points: 2 },
                { id: 'pils', name: 'Pils (0,33l)', price: 3.00, points: 1 },
                { id: 'sekt_glas', name: 'Sekt (Glas)', price: 3.00, points: 0 },
                { id: 'sekt_flasche', name: 'Sekt (Flasche)', price: 20.00, points: 0 }
            ],
            food: [
                { id: 'butterbrezel', name: 'Butterbrezel', price: 2.00 },
                { id: 'muffin', name: 'Muffin', price: 1.50 },
                { id: 'pommes', name: 'Pommes', price: 3.50 },
                { id: 'saiten', name: '1 Paar Saiten', price: 4.50 },
                { id: 'grillfleisch', name: 'Grillfleischwecken', price: 5.00 }
            ]
        };
        
        res.render('layouts/cashierPage', {
            teamsByGroup: teamsByGroup,
            products: products,
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
        const { teamId, items } = req.body;
        
        if (!teamId || !items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Team ID und Items erforderlich' });
        }

        // Berechne Weizen, Pils und Punkte
        let weizenCount = 0;
        let pilsCount = 0;
        let points = 0;
        
        items.forEach(item => {
            if (item.id === 'weizen') {
                weizenCount += item.quantity;
                points += item.quantity * 2; // Weizen = 2 Punkte
            } else if (item.id === 'pils') {
                pilsCount += item.quantity;
                points += item.quantity * 1; // Pils = 1 Punkt
            }
        });

        // Nur updaten wenn ein echtes Team ausgewählt wurde (nicht "Kein Team")
        if (teamId !== 'no_team') {
            const team = await Team.findById(teamId);
            
            if (!team) {
                return res.status(404).json({ success: false, message: 'Team nicht gefunden' });
            }

            // Update drinksCount
            if (!team.drinksCount) {
                team.drinksCount = { weizen: 0, pils: 0, points: 0 };
            }
            
            team.drinksCount.weizen = (team.drinksCount.weizen || 0) + weizenCount;
            team.drinksCount.pils = (team.drinksCount.pils || 0) + pilsCount;
            team.drinksCount.points = (team.drinksCount.points || 0) + points;
            
            await team.save();

            // Emit socket event für Live-Updates
            if (global.io) {
                global.io.emit('drinksCountUpdated', {
                    teamId: team._id,
                    teamName: team.name,
                    drinksCount: team.drinksCount
                });
            }

            res.json({ 
                success: true, 
                message: 'Bestellung erfolgreich',
                drinksCount: team.drinksCount
            });
        } else {
            // "Kein Team" - nur Bestätigung ohne DB-Update
            res.json({ 
                success: true, 
                message: 'Bestellung erfolgreich (Kein Team)'
            });
        }
    } catch (err) {
        console.error('Error updating drinks count:', err);
        res.status(500).json({ success: false, message: 'Server Fehler' });
    }
});

// GET Route für das Bier-Ranking
router.get('/ranking', async (req, res) => {
    try {
        // Top 5 Teams mit den höchsten Punkten
        const teams = await Team.find({})
            .sort({ 'drinksCount.points': -1 })
            .limit(5);
        
        // Top 3 für Balkendiagramm
        const topThree = teams.slice(0, 3);
        
        res.render('layouts/beerRanking', {
            teams: teams,
            topThree: topThree,
            title: 'Bier-Ranking'
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
            .sort({ 'drinksCount.points': -1 })
            .limit(5)
            .select('name drinksCount');
        
        const topThree = teams.slice(0, 3);
        
        res.json({ success: true, teams: teams, topThree: topThree });
    } catch (err) {
        console.error('Error fetching ranking data:', err);
        res.status(500).json({ success: false, message: 'Server Fehler' });
    }
});

module.exports = { router };
