const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Feedback = mongoose.model('Feedback');
const MainSettings = mongoose.model('MainSettings');
const { checkLoginStatus, verifyToken, isAdmin } = require('../middleware/auth');
const cookieParser = require('cookie-parser');

router.use(cookieParser());

// Middleware to check if feedback is enabled
async function checkFeedbackEnabled(req, res, next) {
    try {
        const mainSettings = await MainSettings.findOne({});
        if (!mainSettings || !mainSettings.feedbackOptions || !mainSettings.feedbackOptions.enableFeedback) {
            return res.status(403).render('layouts/feedback', {
                error: true,
                feedbackDisabled: true,
                username: req.username,
                userrole: req.userRole
            });
        }
        next();
    } catch (error) {
        console.error('Error checking feedback settings:', error);
        res.status(500).send('Internal Server Error');
    }
}

// Public feedback form - accessible to everyone (if enabled)
router.get('/', checkLoginStatus, checkFeedbackEnabled, (req, res) => {
    res.locals.username = req.username;
    res.locals.userrole = req.userRole;
    res.render('layouts/feedback', { 
        username: req.username,
        userrole: req.userRole,
        success: req.query.success === 'true',
        error: req.query.error === 'true'
    });
});

// Public feedback submission - accessible to everyone (if enabled)
router.post('/submit', checkLoginStatus, checkFeedbackEnabled, async (req, res) => {
    try {
        const { title, name, message } = req.body;
        
        // Server-side input validation
        const validationErrors = [];
        
        // Validate title
        if (!title || typeof title !== 'string') {
            validationErrors.push('Titel ist erforderlich');
        } else if (title.trim().length < 3) {
            validationErrors.push('Titel muss mindestens 3 Zeichen lang sein');
        } else if (title.trim().length > 100) {
            validationErrors.push('Titel darf maximal 100 Zeichen lang sein');
        }
        
        // Validate message
        if (!message || typeof message !== 'string') {
            validationErrors.push('Nachricht ist erforderlich');
        } else if (message.trim().length < 10) {
            validationErrors.push('Nachricht muss mindestens 10 Zeichen lang sein');
        } else if (message.trim().length > 2000) {
            validationErrors.push('Nachricht darf maximal 2000 Zeichen lang sein');
        }
        
        // Validate name (optional but if provided, should be reasonable)
        if (name && typeof name === 'string' && name.trim().length > 50) {
            validationErrors.push('Name darf maximal 50 Zeichen lang sein');
        }
        
        // If validation fails, redirect with error
        if (validationErrors.length > 0) {
            console.log('Validation errors:', validationErrors);
            return res.redirect('/feedback?error=validation&details=' + encodeURIComponent(validationErrors.join(', ')));
        }
        
        const newFeedback = new Feedback({
            title: title.trim(),
            name: (name && typeof name === 'string') ? name.trim() : '', 
            message: message.trim(),
            userRole: req.userRole || 'anonymous'
        });
        
        await newFeedback.save();
        res.redirect('/feedback?success=true');
    } catch (error) {
        console.error('Error saving feedback:', error);
        res.redirect('/feedback?error=true');
    }
});

// Admin feedback list - only for admins
router.get('/list', verifyToken, isAdmin, async (req, res) => {
    try {
        const feedbacks = await Feedback.find({}).sort({ timestamp: -1 });
        
        res.locals.username = req.username;
        res.locals.userrole = req.userRole;
        
        res.render('layouts/feedbackList', {
            feedbacks,
            username: req.username,
            userrole: req.userRole
        });
    } catch (error) {
        console.error('Error fetching feedback:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Mark feedback as read - only for admins
router.post('/markRead/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        await Feedback.findByIdAndUpdate(req.params.id, { isRead: true });
        res.redirect('/feedback/list');
    } catch (error) {
        console.error('Error marking feedback as read:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Delete feedback - only for admins
router.post('/delete/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        await Feedback.findByIdAndDelete(req.params.id);
        res.redirect('/feedback/list');
    } catch (error) {
        console.error('Error deleting feedback:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Download feedback as text file - only for admins
router.get('/download', verifyToken, isAdmin, async (req, res) => {
    try {
        const feedbacks = await Feedback.find({}).sort({ timestamp: -1 });
        
        let textContent = '='.repeat(80) + '\n';
           textContent += `BUDETURNIER ${new Date().getFullYear()} - FEEDBACK ÜBERSICHT\n`;
        textContent += '='.repeat(80) + '\n';
        textContent += `Generiert am: ${new Date().toLocaleString('de-DE')}\n`;
        textContent += `Anzahl Einträge: ${feedbacks.length}\n\n`;
        
        feedbacks.forEach((feedback, index) => {
            textContent += '-'.repeat(60) + '\n';
            textContent += `FEEDBACK #${index + 1}\n`;
            textContent += '-'.repeat(60) + '\n';
            textContent += `Titel: ${feedback.title}\n`;
            textContent += `Name: ${feedback.name || 'Anonym'}\n`;
            textContent += `Benutzerrolle: ${feedback.userRole}\n`;
            textContent += `Datum: ${feedback.timestamp.toLocaleString('de-DE')}\n`;
            textContent += `Status: ${feedback.isRead ? 'Gelesen' : 'Ungelesen'}\n`;
            textContent += `\nNachricht:\n${feedback.message}\n\n`;
        });
        
        textContent += '='.repeat(80) + '\n';
        textContent += 'ENDE DES FEEDBACK-REPORTS\n';
        textContent += '='.repeat(80);
        
        const filename = `Feedback_${new Date().toISOString().slice(0, 10)}_${Date.now()}.txt`;
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(textContent);
    } catch (error) {
        console.error('Error downloading feedback:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;