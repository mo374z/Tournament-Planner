// this is the main entry point of our application and should only contain the absolute minimum code needed to start our application

const path = require('path');
const express = require('express');
const handlebars = require('handlebars');
const exphbs = require('express-handlebars');
const {allowInsecurePrototypeAccess} = require('@handlebars/allow-prototype-access');
const app = express();

require('./src/models/db');


const bodyparser = require('body-parser');

app.use(bodyparser.urlencoded({extended: false}));
app.use(bodyparser.json());


app.get('/', (request, response) => {
     response.render('home', {
      name: 'John'
    });

   // response.send('<h2>Welcome</h2> <h3>Click here to get acess to <b> <a href="/student/list"> Database</a></h3></b>');
  });


app.set('views', path.join(__dirname, '/src/views/'));

app.engine('hbs', exphbs.engine({
  handlebars: allowInsecurePrototypeAccess(handlebars),
  defaultLayout: 'main',
  extname: 'hbs',
  layoutsDir: __dirname + '/src/views/layouts/',
}));

app.set('view engine', 'hbs');

app.listen(3000, () => {
  console.log("server started at localhost port 3000");
 });
 


 const TeamController = require("./src/controllers/TeamController");

 const TeamController = require("./src/controllers/ScheduleController");


 app.use("/team", TeamController);

 app.use("/schedule", ScheduleController);
 


  