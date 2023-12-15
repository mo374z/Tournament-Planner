

// // write a function, that given all the teams generates a schedule of games for the group phase
// function generateGroupSchedule(teams) {
//     // TODO
// }

// // generate a schedule for the k.o. phase given the results of the group phase
// function generateKOSchedule(groupResults) {
//     // TODO
// }


const express = require('express');
var router = express.Router();

const mongoose = require('mongoose');
const Team = mongoose.model('Game');



// router.get('/', (req,res) => {
//     res.render('layouts/team_addOrEdit', {
//         viewTitle: 'Games'
//     });

// });
