
import Team from './Team';

// This function will be used for later versions of the application
class Player {
  constructor(name, color) {
    this.name = name;
    this.number = "";
    this.goals = 0;
    this.team = Team;
  }

    score() {
        this.goals++;
    }

    getGoals() {
        return this.goals;
    }

    getTeam() {
        return this.team;
    }

    setTeam(team) {
        this.team = team;
    }
}