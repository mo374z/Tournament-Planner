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

require('./User');





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

  const defaultStartTime = new Date('2024-01-20T08:00:00.000Z'); //in unserer Zeitzone: 20.01.2024 09:00 Uhr
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

function backupDb() {
  //fetch the name of the current database
  const dbName = mongoose.connection.db.databaseName;
  const backupFile = `${backupPathArchive}/mongodump-${dbName}`;
  const backupURI = 'mongodb://0.0.0.0:27017/' + dbName;


  const command = `mongodump --uri=${backupURI} --db=${dbName} --archive="${backupFile}"`;

  exec(command, (error, stdout, stderr) => {
      if (error) {
          console.error(`Fehler beim Erstellen des Backups: ${error}`);
          return;
      }

      console.log(`Backup erfolgreich erstellt unter: ${backupFile}`);
  });



  const commandJSON = `mongodump --uri=${backupURI} --out=${backupPathJSON}`;

  exec(commandJSON, (error, stdout, stderr) => {
      if (error) {
          console.error(`Fehler beim Erstellen des Backups als JSON: ${error}`);
          return;
      }

      console.log(`BackupJSON erfolgreich erstellt unter: ${backupPathJSON}`);
  });
}

function restoreDb(dbName) {
  //look for the newest created db
    console.log('Restoring database:', dbName);
    const dbNameRestored = `${dbName}Restored`;
    const backupFile = `${backupPathArchive}/mongodump-${dbName}`;
    const backupURI = 'mongodb://0.0.0.0:27017/' + dbName;

    const command = `mongorestore --uri=${backupURI} --archive="${backupFile}" --nsFrom="${dbName}.*" --nsTo="${dbNameRestored}.*"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Fehler beim Wiederherstellen des Backups: ${error}`);
            return;
        }

        console.log(`Backup erfolgreich wiederhergestellt von: ${backupFile}`);
    });
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
};


//module.exports = connectToMongo;


