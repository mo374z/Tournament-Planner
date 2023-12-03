const mongoose = require('mongoose');


mongoose.connect('mongodb://localhost:27017/StudentDB',{
    useNewURLParser: true

},
err => {
    if(!err){
        console.log('Mongo Connection succeeded');
    }else{
        console.log('Error in connection' +err);
    }
});


require('./student.model.js');