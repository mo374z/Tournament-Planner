const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

// Statische Dateien (CSS, JS) können im Ordner "public" liegen
app.use(express.static('public'));

// Startseite mit Eingabefeldern für Mannschaften
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// POST-Anfrage zum Generieren des Spielplans
app.post('/generate', (req, res) => {
  // Hier den Spielplan generieren basierend auf den eingegebenen Mannschaften
  const teamsGroup1 = req.body.group1.split('\r\n'); // Mannschaften aus Gruppe 1
  const teamsGroup2 = req.body.group2.split('\r\n'); // Mannschaften aus Gruppe 2
  const teamsGroup3 = req.body.group3.split('\r\n'); // Mannschaften aus Gruppe 3

  // Hier den Spielplan generieren...

  // Beispiel: Ausgabe des generierten Spielplans
  const schedule = {
    group1: generateSchedule(teamsGroup1),
    group2: generateSchedule(teamsGroup2),
    group3: generateSchedule(teamsGroup3),
  };

  res.send(schedule);
});

// Funktion zum Generieren des Spielplans (einfaches Beispiel)
function generateSchedule(teams) {
  const schedule = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      schedule.push(`${teams[i]} vs ${teams[j]}`);
    }
  }
  return schedule;
}

// Server starten
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server gestartet auf Port ${PORT}`);
});
