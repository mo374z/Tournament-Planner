// const mongoose = require('mongoose');


// mongoose.connect('mongodb://localhost:27017/TournamentDB',{
//     useNewURLParser: true

// },
// err => {
//     if(!err){
//         console.log('Mongo Connection succeeded');
//     }else{
//         console.log('Error in connection' +err);
//     }
// });


const mongoose = require('mongoose');
const mongoURI = "mongodb://localhost:27017/TournamentDB"

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

