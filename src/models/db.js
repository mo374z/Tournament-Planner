const mongoose = require('mongoose');
const fs = require('fs');
const mongoURI = "mongodb://0.0.0.0:27017/TournamentDB";


const connectToMongo = async () => {
try {
    mongoose.connect(mongoURI) 
    console.log('Mongo connected')
}
catch(error) {
    console.log(error)
    process.exit()
}
}

mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to', mongoURI);
});
mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});
mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

const { MongoClient } = require('mongodb');

async function listDbs() {
  const client = new MongoClient(mongoURI);
  await client.connect();
  const adminDb = client.db().admin();
  const dbs = await adminDb.listDatabases();
  await client.close();
  return dbs.databases;
}


connectToMongo();

require('./Team');
require('./Game');
require('./MainSettings');
require('./GeneralCounters');
require('./Player');
require('./User');
require('./Feedback');


async function createDb(dbName) {   // Create a new database for the tournament
    console.log('Creating new database:', dbName);
    const client = new MongoClient(mongoURI);
    await client.connect();
    const db = client.db(dbName);
    await insertDefaultValues(db); // Insert default values into the new database
    await insertDefaultUser(db); // Create a default user for the database
    await client.close();
}



//folgende funktionen wollte ich in ihre jeweiligen dateien einfügen, aber es hat nicht funktioniert: 
//(node:16204) Warning: Accessing non-existent property 'switchDb' of module exports inside circular dependency

const bcrypt = require('bcrypt');
async function insertDefaultUser(db) { // Create a default user for the database
    const collection = db.collection('users');
    hashedPassword = await bcrypt.hash('admin', 10);
    await collection.insertOne({
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
    }); 
}


async function insertDefaultValues(db) { // Insert default values into the new database

  const defaultStartTime = new Date('2026-01-17T08:00:00.000Z'); //in unserer Zeitzone: 17.01.2026 08:00 Uhr
  const defaultTimeBetweenGames = 2 * 60 * 1000; 
  const defaultGameDurationGroupStage = 8 * 60 * 1000; 
  const defaultGameDurationQuarterfinals = 10 * 60 * 1000;
  const defaultGameDurationSemifinals = 10 * 60 * 1000;
  const defaultGameDurationFinal = 10 * 60 * 1000;
  const defaultTimeBetweenGamePhases = 5 * 60 * 1000;
  const defaultgoalsforSekt = 10;


    // Insert default mainSettings
    const collection = db.collection('mainsettings');
    await collection.insertOne({
        TornamentStartTime: defaultStartTime,
        timeBetweenGames: defaultTimeBetweenGames,
        gameDurationGroupStage: defaultGameDurationGroupStage,
        gameDurationQuarterfinals: defaultGameDurationQuarterfinals,
        gameDurationSemifinals: defaultGameDurationSemifinals,
        gameDurationFinal: defaultGameDurationFinal,
        timeBetweenGamePhases: defaultTimeBetweenGamePhases,
        goalsforSekt: defaultgoalsforSekt,
        // Add other default values if needed
    });

    // Insert default generalCounters
    const generalCountersCollection = db.collection('generalcounters');
    await generalCountersCollection.insertOne({
      allGoals: 0,
      gamesPlayed: 0,
      goalSektCounter: 0,
    });
}

async function switchDb(dbName) {
  await mongoose.disconnect();
  await mongoose.connect(`mongodb://0.0.0.0:27017/${dbName}`);
  if (mongoose.connection.db.databaseName === dbName) {
    console.log(`Successfully switched to database ${dbName}`);
  } else {
    console.error(`Failed to switch to database ${dbName}`);
  }
}

const { exec } = require('child_process');
const path = require('path');
const backupPathArchive = './backup/archive';
const backupPathJSON = './backup/JSON';

function checkPath(pathList) {
  // check if backup path exists by splitting it into parts and creating each part if it does not exist
  pathList.forEach((path) => {
    const pathParts = path.split('/');
    let currentPath = '';
    pathParts.forEach((part) => {
      currentPath += `${part}/`;
      if (!fs.existsSync(currentPath)) {
        fs.mkdirSync(currentPath);
      }
    });
  });
}

checkPath([backupPathArchive, backupPathJSON]);


// Backup erstellen
function backupDb(dbName, backupPathArchive, backupPathJSON, withJSON = false) {
  // Lokale Zeit im Format: YYYY-MM-DD_HH-mm-ss
  const timestamp = new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })
    .replace(/[\s,]/g, "_")  // Leerzeichen und Kommas ersetzen
    .replace(/:/g, "-")      // Doppelpunkte durch Bindestriche ersetzen
    .replace(/__/g, "_");      // Doppelte Unterstriche durch einen ersetzen
  const backupFile = path.join(backupPathArchive, `${dbName}_${timestamp}.gz`);
  const backupURI = `mongodb://0.0.0.0:27017/${dbName}`;

  return new Promise((resolve, reject) => {
      // Archiv-Backup erstellen
      const commandArchive = `mongodump --uri=${backupURI} --archive="${backupFile}" --gzip`;

      exec(commandArchive, (error, stdout, stderr) => {
          if (error) {
              return reject(`Fehler beim Erstellen des Backups: ${stderr}`);
          }
          console.log(`Backup erfolgreich erstellt unter: ${backupFile}`);

          if (!withJSON) {
              return resolve(backupFile);
          }
          // JSON-Backup erstellen
          const commandJSON = `mongodump --uri=${backupURI} --out="${backupPathJSON}"`;

          exec(commandJSON, (jsonError, jsonStdout, jsonStderr) => {
              if (jsonError) {
                  return reject(`Fehler beim Erstellen des JSON-Backups: ${jsonStderr}`);
              }
              console.log(`BackupJSON erfolgreich erstellt unter: ${backupPathJSON}`);
              resolve({ backupFile, backupPathJSON });
          });
      });
  });
}

function restoreDb(backupFile) {  
  // Den Namen der Original-Datenbank aus dem Dateinamen extrahieren
  const originalDbName = path.basename(backupFile, '.gz').split('_')[0];  // Z.B. TournamentDB_20260115_183347 -> TournamentDB
  const sanitizedDbName = originalDbName;  // Der Name der neuen DB bleibt der gleiche wie der alte

  console.log(`Sanitized DB-Name für Wiederherstellung: ${sanitizedDbName}`);

  return new Promise((resolve, reject) => {
      // Hier wird der Befehl für den Restore angepasst, sodass alle Sammlungen in der neuen DB landen
      const command = `mongorestore --archive="${backupFile}" --gzip --nsFrom=".*" --nsTo="${sanitizedDbName}.*" --drop`;

      console.log(`Restore-Befehl: ${command}`);

      exec(command, (error, stdout, stderr) => {
          if (error) {
              return reject(`Fehler beim Wiederherstellen des Backups: ${stderr}`);
          }
          console.log(stdout);
          console.log(stderr);
          console.log(`Backup erfolgreich wiederhergestellt für: ${sanitizedDbName}`);
          resolve(`Restore erfolgreich: ${sanitizedDbName}`);
      });
  });

  //Das Restoren in eine DB mit anderem namen funktioniert nicht, da die die IDs in der zu restorenden DB dann doppelt in mongodb vorhanden ind und es zu fehlern kommt wenn die alte noch da ist
}




 function listBackups() {
  try {
    let filenames = fs.readdirSync(backupPathArchive);
    filenames = filenames.map((file) => file.replace(/^mongodump-/, ''));
    return filenames;
  } catch (err) {
    console.error('Error reading directory:', err);
    return [];
  }
}


module.exports = {
  connectToMongo,
  listDbs,
  createDb,
  switchDb,
  backupDb,
  restoreDb,
  listBackups,
  backupPathArchive,
  backupPathJSON,
};


