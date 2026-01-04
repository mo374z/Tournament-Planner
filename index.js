const bodyparser = require('body-parser');
const path = require('path');
const https = require('https');
const http = require('http');
const fs = require('fs');
const express = require('express');
const handlebars = require('handlebars');
const exphbs = require('express-handlebars');
const {allowInsecurePrototypeAccess} = require('@handlebars/allow-prototype-access');
const app = express();
const mongoose = require('mongoose');

require('./src/models/db');
const {updateSocketConfig} = require('./src/config/socketConfig');
const {TeamController} = require("./src/controllers/TeamController");
const {ScheduleController} = require("./src/controllers/ScheduleController");
const MainSettingController = require("./src/controllers/MainSettingController").router
const GameController = require("./src/controllers/GameController").router;
const AuthenticationController = require("./src/controllers/AuthenticationController").router;
const PublicPageController = require("./src/controllers/PublicPageController");
const ScorerController = require("./src/controllers/ScorerController").router;
const PlayerController = require("./src/controllers/PlayerController");
const CertificateController = require("./src/controllers/CertificateController");
const FeedbackController = require("./src/controllers/FeedbackController");
const MyTeamController = require("./src/controllers/MyTeamController");

const socketConfig = updateSocketConfig(process.argv.slice(2));

const port = socketConfig.port;
const useHttps = socketConfig.protocol === 'https';

console.log('Starting server with the following configuration:', socketConfig);

app.use(bodyparser.urlencoded({ extended: false }));
app.use(bodyparser.json());
app.set('views', path.join(__dirname, '/src/views/'));
app.engine('hbs', exphbs.engine({
  handlebars: allowInsecurePrototypeAccess(handlebars),
  defaultLayout: 'main',
  extname: 'hbs',
  layoutsDir: __dirname + '/src/views/layouts/',
  helpers: {
    formatTime: function (time) {
      const formattedTime = new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return formattedTime;
    },
    formatDateTime: function (time) {
      time.setHours(time.getHours() + 1);
      const formattedTime = new Date(time).toISOString().slice(0, 16);
      return formattedTime;
    },
    eq: function (v1, v2) {
      return v1 && v1.equals && v1.equals(v2);
    },
    eqref: function (v1, v2) {
      return v1 === v2;
    },
    stringeq: function (v1, v2) {
      if (v1 == null || v2 == null) {
        return false;
      }
      return v1.toString() === v2.toString();
    },
    getTeamName: function (teamId, options) {
      const team = options.data.root.teams.find(team => team._id.toString() === teamId.toString());
      return team ? team.name : 'Team not found';
    },
    json: function (context) {    // Helper to output context as JSON string
      return JSON.stringify(context);
    },
    log: function (...args) {
      console.log('Logging:', ...args);
      return '';
    },
    milliToMin: function (milliseconds) {
      return milliseconds / (1000 * 60);
    },
    streq: function (a, b, options) { // String equality check with block helpers
      return a === b ? options.fn(this) : options.inverse(this);
    },
    gt: function (a, b) {      
        return a > b ? true : false;
    },
    or: function (a, b) {
      return a || b;
    },
    getQueryParams: function() {
      return {};
    },
    lookup: function(obj, key) {
      return obj && obj[key];
    },
    substring: function(str, start, end) {
      if (!str) return '';
      return str.substring(start, end);
    },
    // Logo-System Helpers für container-unabhängige Positionierung
    logoPosition: function(normalizedValue) {
      // Auto-Migration: Wenn Wert > 1, dann ist es ein alter Prozentwert
      if (normalizedValue > 1) {
        return Math.max(0, Math.min(100, normalizedValue)).toFixed(1) + '%';
      }
      // Inline normalizedToPercent
      const value = normalizedValue || 0.5;
      return `${(value * 100).toFixed(1)}%`;
    },
    // Math helper for division
    divide: function(a, b) {
      return a / b;
    },
    // Math helper for multiplication  
    multiply: function(a, b) {
      return a * b;
    },
    // Kompletter Logo Helper - rendert komplettes Logo-Div (benötigt team.logo Objekt und Teamnamen und Höhe/Breite)
    logoDiv: function(logoConfig, teamName, width = 150, height = 150, options = {}) {
      if (!logoConfig || !logoConfig.path) {
        // Fallback wenn kein Logo vorhanden
        const fallbackStyle = options.fallback || 'background: #f8f9fa; border: 1px solid #ddd; border-radius: 50%; display: flex; align-items: center; justify-content: center; overflow: hidden;';
        return `<div style="width: ${width}px; height: ${height}px; ${fallbackStyle}">
          <small class="text-muted">Logo</small>
        </div>`;
      }
      
      // Berechne Positionen und Skalierung
      // Inline normalizedToPercent für x und y
      const xValue = logoConfig.position?.x || 0.5;
      const yValue = logoConfig.position?.y || 0.5;
      const x = `${(xValue * 100).toFixed(1)}%`;
      const y = `${(yValue * 100).toFixed(1)}%`;
      
      const baseScale = logoConfig.scale || 0.5;
      const containerSize = Math.min(width, height);
      const scaleFactor = containerSize / 150;
      const adjustedScale = Math.max(0.1, Math.min(2, baseScale * scaleFactor));
      
      const backgroundColor = logoConfig.backgroundColor || '#f8f9fa';
      const borderRadius = options.borderRadius || '50%';  // Standard: Kreis
      const border = options.border || 'none'; // Standard: kein Rahmen
      const overflow = options.overflow || 'hidden';  // Wichtig für Kreis-Clipping
      
      return `<div style="width: ${width}px; height: ${height}px; position: relative; 
                          background: ${backgroundColor}; border-radius: ${borderRadius}; border: ${border}; overflow: ${overflow};">
        <img src="${logoConfig.path}" alt="${teamName || 'Team Logo'}" 
             style="position: absolute;
                    left: ${x};
                    top: ${y};
                    transform: translate(-50%, -50%) scale(${adjustedScale});
                    max-width: none;
                    pointer-events: none;">
      </div>`;
    },
    math: function(lvalue, operator, rvalue) {
      lvalue = parseFloat(lvalue);
      rvalue = parseFloat(rvalue);
      
      return {
        "+": lvalue + rvalue,
        "-": lvalue - rvalue,
        "*": lvalue * rvalue,
        "/": rvalue !== 0 ? lvalue / rvalue : 0,
        "%": lvalue % rvalue
      }[operator];
    },
    percentage: function(numerator, denominator) {
      numerator = parseFloat(numerator) || 0;
      denominator = parseFloat(denominator) || 0;
      
      if (denominator === 0) return 0;
      return Math.round((numerator / denominator) * 100 * 100) / 100; // Runde auf 2 Dezimalstellen
    },
  }
}));

app.set('view engine', 'hbs');
app.use(express.static(__dirname + '/public'))
app.use(express.static(path.join(__dirname, 'src/public')));

app.use((req, res, next) => {
  res.locals.path = req.path;
  next();
});

// Use a simple in-memory cache to avoid hitting the database on every request.
let mainSettingsCache = { myTeamEnabled: false };
let mainSettingsCacheLoaded = false;
let mainSettingsCacheLastFetch = 0;
const MAIN_SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Function to invalidate MainSettings cache (can be called from other modules)
function invalidateMainSettingsCache() {
  mainSettingsCacheLoaded = false;
  mainSettingsCacheLastFetch = 0;
  //console.log('MainSettings cache invalidated');
}

// Export cache invalidation function for use by controllers
global.invalidateMainSettingsCache = invalidateMainSettingsCache;

// Global middleware to load only necessary MainSettings fields for navigation
app.use(async (req, res, next) => {
  const now = Date.now();
  
  // If cache is fresh, use it and skip the database query.
  if (
    mainSettingsCacheLoaded &&
    now - mainSettingsCacheLastFetch < MAIN_SETTINGS_CACHE_TTL_MS
  ) {
    res.locals.myTeamEnabled = mainSettingsCache.myTeamEnabled;
    return next();
  }
  
  try {
    const MainSettings = mongoose.model('MainSettings');
    const mainSettings = await MainSettings.findOne(
      {},
      { 'myTeamPageOptions.myTeamEnabled': 1 }
    );
    const myTeamEnabled =
      (mainSettings &&
        mainSettings.myTeamPageOptions &&
        mainSettings.myTeamPageOptions.myTeamEnabled) ||
      false;
    
    // Update cache
    mainSettingsCache = { myTeamEnabled };
    mainSettingsCacheLoaded = true;
    mainSettingsCacheLastFetch = now;
    res.locals.myTeamEnabled = myTeamEnabled;
  } catch (err) {
    console.log('Error loading MainSettings for navigation:', err);
    // On error, fall back to cached value if available, otherwise false.
    res.locals.myTeamEnabled = mainSettingsCacheLoaded
      ? mainSettingsCache.myTeamEnabled
      : false;
  }
  next();
});

app.use("/", PublicPageController);
app.use("/team", TeamController);
app.use("/schedule", ScheduleController);
app.use("/mainSettings", MainSettingController);
app.use("/game", GameController);
app.use("/scorer", ScorerController);
app.use("/player", PlayerController);
app.use("/certificate", CertificateController);
app.use("/feedback", FeedbackController);
app.use("/myteam", MyTeamController);

app.use("/user", AuthenticationController);

app.use(express.static(path.join(__dirname, 'public/teampictures')));
const uploadDir = path.join(__dirname, 'public/teampictures');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('Created upload directory:', uploadDir);
} else {
  console.log('Upload directory already exists:', uploadDir);
}



// Server configuration
if (useHttps) {
  try {
    const httpsServer = https.createServer({
      key: fs.readFileSync('private-key.pem'),
      cert: fs.readFileSync('certificate.pem'),
    }, app);
    
    httpsServer.listen(port, () => {
      console.log(`HTTPS server running on port ${port}`);
    });
  } catch (error) {
    console.error('Failed to start HTTPS server:', error.message);
    process.exit(1);
  }
} else {
  app.listen(port, () => {
    console.log(`HTTP server started at localhost port ${port}`);
  });
}


// Check for main settings and users on startup to ensure that the application can run
const checkForMainSettings = require("./src/controllers/MainSettingController").checkForMainSettings;
const checkForUsers = require('./src/controllers/AuthenticationController').checkForUsers;

checkForMainSettings();
checkForUsers();

console.log('Tournament Planner is running...');


