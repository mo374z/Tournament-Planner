// const https = require('https');    //https server erstellen
// const fs = require('fs');

const path = require('path');
const express = require('express');
const handlebars = require('handlebars');
const exphbs = require('express-handlebars');
const { allowInsecurePrototypeAccess } = require('@handlebars/allow-prototype-access');
const app = express();

require('./src/models/db');

const mongoose = require('mongoose');
const Game = mongoose.model('Game');


const bodyparser = require('body-parser');

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
      const formattedTime = new Date(time).toISOString().slice(0, 16); // Adjust the slice based on your datetime-local format
      return formattedTime;
    },
    eq: function (v1, v2) {
      return v1.equals(v2);
    },
    gl: function (v1, v2) {
      //console.log(v1, v2);
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
      return ''; // Return an empty string to avoid adding content to the rendered template
    },
    milliToMin: function (milliseconds) {
      return milliseconds / (1000 * 60); // Convert milliseconds to minutes
    },
    streq: function (a, b, options) {
      return a === b ? options.fn(this) : options.inverse(this);
    }

  }
}));

app.set('view engine', 'hbs');

app.use(express.static(__dirname + '/public'))



app.listen(3000, () => {                                      //http server erstellen
  console.log("Webserver started at localhost port 3000");
});

// // Create an HTTPS server                                  //https server erstellen
// const httpsServer = https.createServer({
//   key: fs.readFileSync('private-key.pem'),
//   cert: fs.readFileSync('certificate.pem'),
// }, app);

// // Listen on port 443
// httpsServer.listen(443, () => {
//   console.log('HTTPS server running on port 443');
// });


app.use(express.static(path.join(__dirname, 'src/public'))); // Statische Dateien wie CSS, Bilder, JS, etc. werden aus dem Ordner "public" geladen

// import the necessary script for the application
const {TeamController} = require("./src/controllers/TeamController");
const {ScheduleController} = require("./src/controllers/ScheduleController");
const MainSettingController = require("./src/controllers/MainSettingController");
const GameController = require("./src/controllers/GameController");
const AuthenticationController = require("./src/controllers/AuthenticationController");
const ScorerController = require("./src/controllers/ScorerController").router; // Import the router from the ScorerController

const PublicPageController = require("./src/controllers/PublicPageController");
const PlayerController = require("./src/controllers/PlayerController");



// const  {verifyToken, checkLoginStatus , isAdmin} =  require('./src/middleware/auth'); // Pfad zu Ihrer auth.js-Datei

// // app.get('/', (request, response) => {
// //   response.render('home');
// // });





// const cookieParser = require('cookie-parser');
// app.use(cookieParser());

// app.get('/', checkLoginStatus, (req, res) => {
//   const username = req.username;
//   const userrole = req.userRole;
//   res.render('home', { username , userrole}); // 'main' ist der Name Ihrer Hauptseite-Vorlage
// });


app.use("/", PublicPageController);



app.use("/team", TeamController);
app.use("/schedule", ScheduleController);
app.use("/mainSettings", MainSettingController);
app.use("/game", GameController);
app.use("/scorer", ScorerController);
app.use("/player", PlayerController);

app.use("/user", AuthenticationController);



