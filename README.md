# Tournament-Planner


## Setup your environment

```bash
npm init
npm install
```
Install mongo DB Tools:
https://www.mongodb.com/docs/database-tools/installation/installation-windows/

> :warning: Team Structre changed please create new Teams in your DB !!!!!
> :warning: MainSettings Structure changed ! Please delete Main Settings document in collection - then open Main Settings: This should generate new default Settings !!!!!


## Start Web Application

The application can be started with various command line arguments to configure the server:

```bash
node index.js [arguments]
```

### Available Arguments:
- `--port <number>`: Sets the main application port (default: 3000)
- `--socket-port <number>`: Sets the WebSocket server port (default: 2053)
- `--https`: Enables HTTPS mode and uses budescharfeseck.de as hostname (default: HTTP with localhost)



uses MonoDB with Database "TournamentDB" and collections "games" "teams" "mainsettings"

> :warning: **Internet Connection Required**: To run the code internet is required because of the <script src="https://cdn.socket.io/4.3.1/socket.io.min.js"></script> in the PlayGame and GameLive page!