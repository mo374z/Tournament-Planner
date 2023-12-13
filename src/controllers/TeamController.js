
// here we should create the connection to MongoDB
teams = [];

// write a function that adds a new team to the database
function addTeam(name) {
    const team = new Team(name);
    teams.push(team);
    return team;
}

// return all teams
function getAllTeams() {
    return teams;
}

function getTeamStats(teamName) {
    // find team stats in Schedule DB and return the current points
}