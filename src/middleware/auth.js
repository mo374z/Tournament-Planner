
const jwt = require('jsonwebtoken');
const jwtSecretkey =
  "4715aed3c946f7b0a38e6b534a8583628d84e96d10fbc04700770d572af3dce43625dd";


function verifyToken(req, res, next) {
    //console.log('verifyToken');
    const token = req.cookies.jwt; // Extract token from the cookie

    if (!token) {        
        return res.status(401).send(`
                    <html>
                        <head>
                            <title>Access Denied</title>
                        </head>
                        <body>
                            <h1>Access Denied</h1>
                            <p>You do not have permission to access this page.</p>
                            <button onclick="window.location.href='/user/login'">Go to Login Page</button>
                        </body>
                    </html>
                `);
    }

    jwt.verify(token, jwtSecretkey, (err, decoded) => {
        if (err) {
            return res.status(403).send('Invalid token');
        }
        req.username = decoded.username;
        req.userRole = decoded.role;
        next();
    });
}



function checkLoginStatus(req, res, next) {
    const token = req.cookies.jwt;

    if (!token) {
        next();
        return;
    }

    jwt.verify(token, jwtSecretkey, (err, decoded) => {
        if (err) {
            next();
            return;
        }
        req.username = decoded.username;
        req.userRole = decoded.role;
        next();
    });
}


// Middleware, um zu überprüfen, ob der Benutzer ein Admin ist
function isAdmin(req, res, next) {
    if (req.userRole === 'admin') {
      next();
    } else {
      res.status(403).send('Nur für Admins zugänglich');
    }
  }

module.exports = { verifyToken, checkLoginStatus , isAdmin};