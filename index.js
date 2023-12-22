// this is the main entry point of our application and should only contain the absolute minimum code needed to start our application

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

  // response.send('<h2>Welcome</h2> <h3>Click here to get acess to <b> <a href="/student/list"> Database</a></h3></b>');
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
      // console.log("Vergleiche");
      // console.log(v1);
      // console.log("mit");
      // console.log(v2);
      // if(v1.equals(v2)){ console.log("true");}
      return v1.equals(v2);
    },
    log: function (...args) {
      console.log('Logging:', ...args);
      return ''; // Return an empty string to avoid adding content to the rendered template
    },
    milliToMin: function (milliseconds) {
      return milliseconds / (1000 * 60); // Convert milliseconds to minutes
    }
  }
}));

app.set('view engine', 'hbs');

app.listen(3000, () => {
  console.log("server started at localhost port 3000");
});



const TeamController = require("./src/controllers/TeamController");

const ScheduleController = require("./src/controllers/ScheduleController");

const MainSettingController = require("./src/controllers/MainSettingController");

const GameController = require("./src/controllers/GameController");


app.use("/team", TeamController);

app.use("/schedule", ScheduleController);

app.use("/mainSettings", MainSettingController);

app.use("/game", GameController);



