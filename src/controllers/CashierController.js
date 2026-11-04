const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Team = mongoose.model('Team');
const ProductSales = mongoose.model('ProductSales');
const Product = require('../models/Product');
const { updateSocketConfig } = require('../config/socketConfig');
const socketConfig = updateSocketConfig(process.argv.slice(2));

// Middleware to check if user is logged in
const { verifyToken, authorizeRoles } = require('../middleware/auth');
const cookieParser = require('cookie-parser');
const { randomUUID } = require('crypto');
const kitchenOrders = [];

// Initiale Produktliste für bestehende Installationen; Änderungen danach erfolgen in der Produktverwaltung.
const DEFAULT_PRODUCTS = {
    drinks: [
        { id: 'wasser', name: 'Wasser', price: 1.50, points: 0 },
        { id: 'antialk', name: 'Antialk', price: 2.00, points: 0 },
        { id: 'weizen', name: 'Weizen (0,5l)', price: 3.50, points: 3 },
        { id: 'pils', name: 'Pils (0,33l)', price: 3.00, points: 2 },
        { id: 'sekt_glas', name: 'Sekt (Glas)', price: 3.00, points: 0 },
        { id: 'sekt_flasche', name: 'Sekt (Flasche)', price: 20.00, points: 0 }
    ],
    food: [
        { id: 'butterbrezel', name: 'Butterbrezel', price: 2.00, points: 0 },
        { id: 'muffin', name: 'Muffin', price: 1.50, points: 0 },
        { id: 'pommes', name: 'Pommes', price: 3.50, points: 0 },
        { id: 'saiten', name: '1 Paar Saiten', price: 4.50, points: 0 },
        { id: 'grillfleisch', name: 'Grillfleischwecken', price: 5.00, points: 0 }
    ]
};

async function ensureDefaultProducts() {
    const defaults = Object.entries(DEFAULT_PRODUCTS).flatMap(([category, products]) =>
        products.map((product, index) => ({
            productId: product.id,
            name: product.name,
            category,
            price: product.price,
            points: product.points,
            sendToKitchen: category === 'food',
            sortOrder: index
        }))
    );

    await Promise.all([
        ...defaults.map(product =>
            Product.updateOne(
            { productId: product.productId },
            { $setOnInsert: product },
            { upsert: true }
            )
        ),
        Product.updateMany(
            { category: 'food', sendToKitchen: { $exists: false } },
            { $set: { sendToKitchen: true } }
        ),
        Product.updateMany(
            { category: 'drinks', sendToKitchen: { $exists: false } },
            { $set: { sendToKitchen: false } }
        )
    ]);
}

function getProductsByCategory(products) {
    return {
        drinks: products.filter(product => product.category === 'drinks'),
        food: products.filter(product => product.category === 'food')
    };
}

async function renderProductManagement(res, options = {}) {
    const products = await Product.find({ deleted: { $ne: true } })
        .sort({ category: 1, sortOrder: 1, name: 1 })
        .lean();
    res.render('layouts/productManagement', {
        products: getProductsByCategory(products),
        ...options,
        title: 'Produkte verwalten'
    });
}

// GET Kassier-Seite für Getränkebestellung
router.get('/order', cookieParser(), verifyToken, authorizeRoles('admin', 'cashier'), async (req, res) => {
    try {
        await ensureDefaultProducts();
        
        // Alle Teams sortiert nach Gruppe und Name
        const teams = await Team.find({}).sort({ group: 1, name: 1 });
        const products = await Product.find({ active: true, deleted: { $ne: true } })
            .sort({ category: 1, sortOrder: 1, name: 1 })
            .lean();
        
        // Gruppiere Teams
        const teamsByGroup = {};
        teams.forEach(team => {
            if (!teamsByGroup[team.group]) {
                teamsByGroup[team.group] = [];
            }
            teamsByGroup[team.group].push(team);
        });
        
        res.render('layouts/cashierPage', {
            teamsByGroup: teamsByGroup,
            products: getProductsByCategory(products),
            title: 'Getränkebestellung',
            username: req.username,
            userrole: req.userRole
        });
    } catch (err) {
        console.error('Error loading cashier page:', err);
        res.status(500).send('Server Error');
    }
});

router.get('/products', cookieParser(), verifyToken, authorizeRoles('admin', 'cashier'), async (req, res) => {
    try {
        await ensureDefaultProducts();
        await renderProductManagement(res, {
            username: req.username,
            userrole: req.userRole,
            saved: req.query.saved === '1'
        });
    } catch (err) {
        console.error('Error loading product management:', err);
        res.status(500).send('Produkte konnten nicht geladen werden.');
    }
});

router.get('/kitchen', cookieParser(), verifyToken, authorizeRoles('admin', 'cashier'), (req, res) => {
    res.render('layouts/kitchenPage', {
        socketConfig,
        title: 'Küchenbestellungen',
        username: req.username,
        userrole: req.userRole
    });
});

router.get('/kitchen/orders', cookieParser(), verifyToken, authorizeRoles('admin', 'cashier'), (req, res) => {
    res.json({ success: true, orders: kitchenOrders });
});

router.post('/kitchen/orders/:orderId/complete', cookieParser(), verifyToken, authorizeRoles('admin', 'cashier'), (req, res) => {
    const orderIndex = kitchenOrders.findIndex(order => order.id === req.params.orderId);
    if (orderIndex === -1) {
        res.status(404).json({ success: false, message: 'Bestellung nicht gefunden oder bereits erledigt.' });
        return;
    }

    const [order] = kitchenOrders.splice(orderIndex, 1);
    if (global.io) global.io.emit('kitchenOrderRemoved', order.id);
    res.json({ success: true });
});

router.post('/products', cookieParser(), verifyToken, authorizeRoles('admin', 'cashier'), async (req, res) => {
    try {
        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        const category = req.body.category;
        const price = Number(req.body.price);
        const points = Number(req.body.points);
        const productId = typeof req.body.productId === 'string' ? req.body.productId : '';
        const errors = [];

        if (!name || name.length > 100) errors.push('Bitte einen Namen mit höchstens 100 Zeichen eingeben.');
        if (!['drinks', 'food'].includes(category)) errors.push('Bitte eine gültige Kategorie auswählen.');
        if (!Number.isFinite(price) || price < 0 || !/^\d+(\.\d{1,2})?$/.test(String(req.body.price))) {
            errors.push('Der Preis muss eine positive Zahl mit maximal zwei Nachkommastellen sein.');
        }
        if (!Number.isInteger(points) || points < 0) errors.push('Punkte müssen eine nicht-negative ganze Zahl sein.');

        if (errors.length) {
            await renderProductManagement(res, {
                username: req.username,
                userrole: req.userRole,
                errors,
                formProduct: {
                    productId,
                    name,
                    category,
                    price: req.body.price,
                    points,
                    active: req.body.active === 'on',
                    sendToKitchen: ['on', 'yes'].includes(req.body.sendToKitchen)
                }
            });
            return;
        }

        if (productId) {
            const product = await Product.findOneAndUpdate(
                { productId },
                {
                    $set: {
                        name,
                        category,
                        price,
                        points,
                        active: req.body.active === 'on',
                        sendToKitchen: ['on', 'yes'].includes(req.body.sendToKitchen)
                    }
                },
                { returnDocument: 'after', runValidators: true }
            );
            if (!product) {
                res.status(404).send('Produkt nicht gefunden.');
                return;
            }
        } else {
            await Product.create({
                productId: new mongoose.Types.ObjectId().toString(),
                name,
                category,
                price,
                points,
                active: true,
                sendToKitchen: ['on', 'yes'].includes(req.body.sendToKitchen),
                sortOrder: 0
            });
        }

        res.redirect('/cashier/products?saved=1');
    } catch (err) {
        console.error('Error saving product:', err);
        res.status(500).send('Produkt konnte nicht gespeichert werden.');
    }
});

router.post('/products/:productId/delete', cookieParser(), verifyToken, authorizeRoles('admin', 'cashier'), async (req, res) => {
    try {
        const product = await Product.findOneAndUpdate(
            { productId: req.params.productId, deleted: { $ne: true } },
            { $set: { active: false, deleted: true } },
            { returnDocument: 'after' }
        );
        if (!product) {
            res.status(404).send('Produkt nicht gefunden.');
            return;
        }

        res.redirect('/cashier/products?saved=1');
    } catch (err) {
        console.error('Error removing product:', err);
        res.status(500).send('Produkt konnte nicht entfernt werden.');
    }
});

// POST Route zum Aktualisieren des Bier-Counts
router.post('/update-beer', cookieParser(), verifyToken, authorizeRoles('admin', 'cashier'), async (req, res) => {
    try {
        const { teamId, items } = req.body;
        
        if (!teamId || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Team ID und Items erforderlich' });
        }

        const itemQuantities = new Map();
        for (const item of items) {
            if (!item || typeof item.id !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1) {
                return res.status(400).json({ success: false, message: 'Ungültige Produktmenge' });
            }
            itemQuantities.set(item.id, (itemQuantities.get(item.id) || 0) + item.quantity);
        }

        const products = await Product.find({
            productId: { $in: [...itemQuantities.keys()] },
            active: true,
            deleted: { $ne: true }
        }).lean();
        if (products.length !== itemQuantities.size) {
            return res.status(400).json({ success: false, message: 'Ein Produkt ist nicht verfügbar.' });
        }
        const productsById = new Map(products.map(product => [product.productId, product]));

        let team = null;
        if (teamId !== 'no_team') {
            if (!mongoose.isValidObjectId(teamId)) {
                return res.status(400).json({ success: false, message: 'Ungültige Team-ID' });
            }
            team = await Team.findById(teamId);
            if (!team) {
                return res.status(404).json({ success: false, message: 'Team nicht gefunden' });
            }
        }

        let weizenCount = 0;
        let pilsCount = 0;
        let points = 0;

        for (const [productId, quantity] of itemQuantities) {
            const product = productsById.get(productId);
            if (product.productId === 'weizen' && product.category === 'drinks') {
                weizenCount += quantity;
            } else if (product.productId === 'pils' && product.category === 'drinks') {
                pilsCount += quantity;
            }
            points += quantity * product.points;

            await ProductSales.findOneAndUpdate(
                { productId },
                {
                    $inc: {
                        totalQuantitySold: quantity,
                        totalRevenue: quantity * product.price
                    },
                    $set: {
                        productName: product.name,
                        category: product.category,
                        price: product.price,
                        points: product.points
                    }
                },
                { upsert: true, returnDocument: 'after' }
            );
        }

        if (team) {
            // Update drinksCount (nur für Teams)
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
        }

        const kitchenOrder = {
            id: randomUUID(),
            createdAt: new Date().toISOString(),
            teamName: team ? team.name : 'Kein Team',
            teamGroup: team ? team.group : '',
            items: [...itemQuantities].map(([productId, quantity]) => {
                const product = productsById.get(productId);
                return {
                    name: product.name,
                    category: product.category,
                    quantity,
                    sendToKitchen: product.sendToKitchen
                };
            })
        };
        kitchenOrder.items = kitchenOrder.items
            .filter(item => item.sendToKitchen)
            .map(({ sendToKitchen, ...item }) => item);
        if (kitchenOrder.items.length > 0) {
            kitchenOrders.push(kitchenOrder);
            if (global.io) global.io.emit('kitchenOrderCreated', kitchenOrder);
        }

        res.json({
            success: true,
            message: team ? 'Bestellung erfolgreich' : 'Bestellung erfolgreich (Kein Team)',
            drinksCount: team ? team.drinksCount : undefined,
            orderId: kitchenOrder.items.length > 0 ? kitchenOrder.id : null
        });
    } catch (err) {
        console.error('Error updating drinks count:', err);
        res.status(500).json({ success: false, message: 'Server Fehler' });
    }
});

// GET Route für das Bier-Ranking
router.get('/ranking', async (req, res) => {
    try {
        // Top 5 Teams mit den höchsten Punkten (nur Teams mit Punkten > 0)
        const teams = await Team.find({ 'drinksCount.points': { $gt: 0 } })
            .sort({ 'drinksCount.points': -1 })
            .limit(5);
        
        // Top 3 für Balkendiagramm
        const topThree = teams.slice(0, 3);
        
        // Calculate max points for proportional scaling
        const maxPoints = topThree.length > 0 ? Math.max(...topThree.map(t => t.drinksCount.points)) : 1;
        
        // Add calculated height to each team
        const topThreeWithHeight = topThree.map(team => {
            const points = team.drinksCount.points || 0;
            const barHeight = maxPoints > 0 ? Math.max(Math.round((points / maxPoints) * 400), 50) : 50;
            console.log(`Team: ${team.name}, Points: ${points}, BarHeight: ${barHeight}`);
            return {
                ...team.toObject(),
                barHeight: barHeight
            };
        });
        
        res.render('layouts/beerRanking', {
            teams: teams,
            topThree: topThreeWithHeight,
            maxPoints: maxPoints,
            socketConfig: socketConfig,
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
        const teams = await Team.find({ 'drinksCount.points': { $gt: 0 } })
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
// GET: Statistiken anzeigen
router.get('/statistics', verifyToken, authorizeRoles('admin'), async (req, res) => {
    try {
        // Hole alle Produktverkaufsstatistiken
        const productStats = await ProductSales.find().sort({ totalQuantitySold: -1 });
        
        // Hole alle Teams mit Punkten
        const teamRanking = await Team.find({ 'drinksCount.points': { $gt: 0 } })
            .sort({ 'drinksCount.points': -1 })
            .select('name drinksCount');
        
        // Berechne Gesamtstatistiken
        const totalStats = {
            totalRevenue: productStats.reduce((sum, p) => sum + p.totalRevenue, 0),
            totalQuantity: productStats.reduce((sum, p) => sum + p.totalQuantitySold, 0),
            totalPoints: teamRanking.reduce((sum, t) => sum + t.drinksCount.points, 0)
        };
        
        res.render('layouts/statisticsPage', {
            productStats: productStats,
            teamRanking: teamRanking,
            totalStats: totalStats,
            title: 'Produktstatistik'
        });
    } catch (err) {
        console.error('Fehler beim Laden der Statistiken:', err);
        res.status(500).render('layouts/error', {
            message: 'Fehler beim Laden der Statistiken',
            error: err
        });
    }
});

// GET: Produktverkäufe zurücksetzen
router.get('/reset-products', verifyToken, authorizeRoles('admin'), async (req, res) => {
    try {
        await ProductSales.deleteMany({});
        res.redirect('/cashier/statistics');
    } catch (err) {
        console.error('Fehler beim Zurücksetzen der Produktverkäufe:', err);
        res.status(500).render('layouts/error', {
            message: 'Fehler beim Zurücksetzen der Produktverkäufe',
            error: err
        });
    }
});

// GET: Team-Rankings zurücksetzen
router.get('/reset-rankings', verifyToken, authorizeRoles('admin'), async (req, res) => {
    try {
        await Team.updateMany(
            {},
            {
                $set: {
                    'drinksCount.weizen': 0,
                    'drinksCount.pils': 0,
                    'drinksCount.points': 0
                }
            }
        );
        res.redirect('/cashier/statistics');
    } catch (err) {
        console.error('Fehler beim Zurücksetzen der Team-Rankings:', err);
        res.status(500).render('layouts/error', {
            message: 'Fehler beim Zurücksetzen der Team-Rankings',
            error: err
        });
    }
});

module.exports = { router };
