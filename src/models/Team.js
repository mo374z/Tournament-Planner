class Team {
  constructor(name, group) {
    this.name = name;
    this.group = group;
    this.players = [];
  }

    addPlayer(player) {
        this.players.push(player);
    }

    getPlayerByName(name) {
        return this.players.find(player => player.name === name);
    }


}