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
const MainSettingController = require("./src/controllers/MainSettingController");
const GameController = require("./src/controllers/GameController");
const AuthenticationController = require("./src/controllers/AuthenticationController");
const PublicPageController = require("./src/controllers/PublicPageController");

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
      return v1.equals(v2);
    },
    gl: function (v1, v2) {
      console.log(v1, v2);
      return v1 === v2;
    },
    log: function (...args) {
      console.log('Logging:', ...args);
      return '';
    },
    milliToMin: function (milliseconds) {
      return milliseconds / (1000 * 60);
    },
    streq: function (a, b, options) {
      return a === b ? options.fn(this) : options.inverse(this);
    }
  }
}));

app.set('view engine', 'hbs');
app.use(express.static(__dirname + '/public'))
app.use(express.static(path.join(__dirname, 'src/public')));

// Routes
app.use("/", PublicPageController);
app.use("/team", TeamController);
app.use("/schedule", ScheduleController);
app.use("/mainSettings", MainSettingController);
app.use("/game", GameController);
app.use("/user", AuthenticationController);

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