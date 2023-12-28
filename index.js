const path = require('path');
const express = require('express');
const handlebars = require('handlebars');
const exphbs = require('express-handlebars');
const { allowInsecurePrototypeAccess } = require('@handlebars/allow-prototype-access');
const app = express();

require('./src/models/db');


const bodyparser = require('body-parser');

app.use(bodyparser.urlencoded({ extended: false }));
app.use(bodyparser.json());


app.get('/', (request, response) => {
  response.render('home');
});

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

app.listen(3000, () => {
  console.log("Webserver started at localhost port 3000");
});

// import the necessary script for the application
const TeamController = require("./src/controllers/TeamController");
const ScheduleController = require("./src/controllers/ScheduleController");
const MainSettingController = require("./src/controllers/MainSettingController");
const GameController = require("./src/controllers/GameController");

app.use("/team", TeamController);
app.use("/schedule", ScheduleController);
app.use("/mainSettings", MainSettingController);
app.use("/game", GameController);



