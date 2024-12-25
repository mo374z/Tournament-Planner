const jwt = require('jsonwebtoken');
const yaml = require('js-yaml');
const fs = require('fs');
const cookieParser = require('cookie-parser');

const keytokens = yaml.load(fs.readFileSync(__dirname + '/../../keytokens.yaml', 'utf8'));
const jwtSecretkey = keytokens.jwtSecretkey;

function verifyToken(req, res, next) {
    const token = req.cookies.jwt;
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

function isAdmin(req, res, next) {
    if (req.userRole === 'admin') {
        next();
    } else {
        res.status(403).send('Nur für Admins zugänglich');
    }
}

function authorizeRoles(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.userRole)) {
            return res.status(403).send('Access denied - Your role: ' + req.userRole + ' - Required roles: ' + roles);
        }
        next();
    };
}

function commonMiddleware(router, roles = []) {
    router.use(cookieParser());
    router.use(verifyToken);
    if (roles.length > 0) {
        router.use(authorizeRoles(...roles));
    }
    router.use((req, res, next) => {
        res.locals.username = req.username;
        res.locals.userrole = req.userRole;
        next();
    });
}

module.exports = { verifyToken, checkLoginStatus, isAdmin, authorizeRoles, commonMiddleware };