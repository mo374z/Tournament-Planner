const mongoose = require('mongoose');
const mongoURI = "mongodb://0.0.0.0:27017/TournamentDB"

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
module.exports = connectToMongo;

connectToMongo();

require('./Team');
require('./Game');
require('./MainSettings');
require('./GeneralCounters');

