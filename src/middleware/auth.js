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
                    <title>Wa wilsch du?</title>
                    <style>
                        body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: sans-serif; background: #f3f4f6; color: #1f2937; }
                        main { max-width: 360px; padding: 2rem; text-align: center; background: white; border-radius: 12px; box-shadow: 0 8px 24px #0001; }
                        h1 { margin-top: 0; }
                        a { display: inline-block; margin-top: 1rem; padding: .7rem 1rem; color: white; background: #2563eb; border-radius: 6px; text-decoration: none; }
                    </style>
                </head>
                <body>
                    <main>
                        <h1>Wa willsch du?</h1>
                        <p>Für diese Seite musst du dich zuerst anmelden.</p>
                        <a href="/user/login">Zum Login</a>
                    </main>
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