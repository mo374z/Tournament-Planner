const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const yaml = require('js-yaml');
const fs = require('fs');

const User = mongoose.model('User');

const { verifyToken, isAdmin } = require('../middleware/auth');

var router = express.Router();

const cookieParser = require('cookie-parser');
router.use(cookieParser());
router.use((req, res, next) => {
    res.locals.username = req.username;
    res.locals.userrole = req.userRole;
    next();
});

const keytokens = yaml.load(fs.readFileSync(__dirname + '/../../keytokens.yaml', 'utf8'));
const jwtSecretkey = keytokens.jwtSecretkey;

router.get('/register',verifyToken, isAdmin,  (req, res) => {
    const username = req.username;
    const userrole = req.userRole;
    res.render('layouts/registerUser' , { username, userrole }); // Render the registration page
});


// User list endpoint
router.get('/list', verifyToken, isAdmin, async (req, res) => {
    const users = await User.find({}); // Fetch all users from the database
    res.render('layouts/userlist', { users }); // 'userlist' ist der Name Ihrer Benutzerliste-Vorlage
  });


// router.get('/createDevUser', async (req, res) => {      // Create a Development User - only for testing adress: /user/createDevUser
//     try {
//         createDevUser();
//         res.status(201).send('Dev User Registration successful - Username: admin, Password: admin');
//     } catch (error) {
//         console.error('Error creating dev user:', error);
//         res.status(500).send('Internal Server Error');
//     }
// });

//funktion to check if there are users in the database
async function checkForUsers() {
    try {
        const users = await User.find({}); // Fetch all users from the database
        if (users.length === 0) {
            createDevUser();
            console.log('No users found. Created dev user');
        }
        else {
            console.log(users.length + ' users found');
        }
    } catch (error) {
        console.error('Error checking for users:', error);
    }
}


//function to create a the dev user
async function createDevUser() {
    try {
            let password = "admin";
            const username = "admin";
            const role = "admin";

            const existingUser = await User.findOne({ username });

            if (existingUser) {
                return res.status(400).send('User already exists');
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            password = hashedPassword;
            
            // Create a new user
            const newUser = new User({ username, password, role });
            await newUser.save();

            console.log('\x1b[31m%s\x1b[0m', 'Dev User Created - Username: admin, Password: admin - Delete this user after testing');

            //res.redirect('/user/login');
        } catch (error) {
            console.error('Error creating dev user:', error);
        }
}
            


// User registration endpoint
router.post('/register', async (req, res) => {
    let { username, password, role } = req.body;

    try {
        // Check if the username already exists in the database
        const existingUser = await User.findOne({ username });

        if (existingUser) {
            return res.status(400).send('Username already exists');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        password = hashedPassword;
        
        // Create a new user
        const newUser = new User({ username, password, role });
        await newUser.save();

        // You might also generate a JWT token here for immediate login after registration

        res.status(201).send('Registration successful');
        //res.redirect('/user/login');
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).send('Internal Server Error');
    }
});


router.get('/login', (req, res) => {
    res.render('layouts/loginPage'); // Render the login page
});


// User login endpoint
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Check if the username exists in the database
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(401).send('User not found');
        }

        // Check if the password is correct
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).send('Invalid password');
        }

        // Generate a JWT token upon successful login, including the role
        const token = jwt.sign(
            {
                username: user.username,
                role: user.role, // Include the role in the token payload
            },
            jwtSecretkey,
            { expiresIn: '15h' } // Set token expiration to 15 hours
        );

        // Save the token in a cookie
        res.cookie('jwt', token, {
            httpOnly: true,
            maxAge: 54000000, // 15 hours in milliseconds
        });

        //res.status(200).json({ token }); // Send the token as a response

        //res.redirect('/user/protected'); // Redirect to the protected route
        res.redirect('/'); // Redirect to main page
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/logout', (req, res) => {
    res.clearCookie('jwt'); // Clear the JWT token cookie
    res.redirect('/user/login'); // Redirect to the login page or any desired page after logout
});


// POST route to delete admin user /mainSettings/deleteAdmin
router.get('/deleteAdmin', verifyToken, isAdmin, async (req, res) => {
    try {
        // Find and delete the admin user
        await User.deleteOne({ username: 'admin' });

        // Redirect to the main settings page after deleting the admin user
        res.redirect('/mainSettings');
    } catch (err) {
        console.error('Error deleting admin user:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Route zum Löschen eines Benutzers
router.post('/user/delete', verifyToken, isAdmin, async (req, res) => {
    try {
        const { username } = req.body;
        if (username !== req.username) {
            await User.deleteOne({ username });
        }
        res.redirect('/user/list');
    } catch (err) {
        console.error('Fehler beim Löschen des Benutzers:', err);
        res.status(500).send('Interner Serverfehler');
    }
});



/* router.get('/protected', verifyToken, (req, res) => {
    if (req.userRole !== 'admin') {
        return res.status(403).send('Access denied. Requires admin role');
    }
    
    res.status(200).send('You have access to this protected admin route: ' + req.username + ' role: ' + req.userRole);
}); */



//export the router and the checkForUsers function
module.exports = { router, checkForUsers };