# Tournament-Planner


## Install all Packages:

npm install


> :warning: Team Structre changed please create new Teams in your DB !!!!!

> :warning: MainSettings Structure changed ! Please delete Main Settings document in collection - then open Main Settings: This should generate new default Settings !!!!!



## Programm starten
node index.js

uses MonoDB with Database "TournamentDB" and collections "games" "teams" "mainsettings"

> :warning: **Internet Connection Required**: To run the code internet is required because of the <script src="https://cdn.socket.io/4.3.1/socket.io.min.js"></script> in the PlayGame and GameLive page!



## Packages:
npm init

npm install --save express path handlebars express-handlebars @handlebars/allow-prototype-access

npm install --save mongoose

npm install socket.io

npm install cors

npm install bcrypt

npm install jsonwebtoken

npm install cookie-parser
