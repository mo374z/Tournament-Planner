const mongoose = require('mongoose');
const mongoURI = "mongodb://0.0.0.0:27017/TournamentDB2024"

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

  const defaultStartTime = new Date('2024-01-20T09:00:00.000Z');
  const defaultTimeBetweenGames = 2 * 60 * 1000; 
  const defaultGameDurationGroupStage = 8 * 60 * 1000; 
  const defaultGameDurationQuarterfinals = 10 * 60 * 1000;
  const defaultGameDurationSemifinals = 10 * 60 * 1000;
  const defaultGameDurationFinal = 10 * 60 * 1000;
  const defaultTimeBetweenGamePhases = 5 * 60 * 1000;
  const defaultgoalsforSekt = 10;


    // Insert default mainSettings
    const collection = db.collection('mainSettings');
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

module.exports = {
  connectToMongo,
  listDbs,
  createDb,
  switchDb,
};


//module.exports = connectToMongo;


