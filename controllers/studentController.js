const express = require('express');
var router = express.Router();

const mongoose = require('mongoose');
const Student = mongoose.model('Student');


router.get('/', (req,res) => {
    res.render('student/addOrEdit', {
        viewTitle: 'Insert Student'
    });

});

router.post('/', (req, res) => {
    if(req.body._id == ''){
        insertRecord(req,res);
    }
    else{
        updateRecord(req,res);
    }
})

function insertRecord(req, res){
    var student = new Student();
    student.fullName = req.body.fullName;
    student.email = req.body.email;
    student.mobile = req.body.mobile;
    student.city = req.body.city;
    student.save((err, doc) => {
        if(!err){
            res.redirect('student/list');
        }
        else{
            console.log('Error during insert: ' + err);
        }
    });
}

function updateRecord(req, res){
    Student.findOneAndUpdate({_id: req.body._id}, req.body, {new: true}, (err,doc) =>{
        if(!err){
            res.redirect('student/list');
        }
        else{
            console.log('Error during update: ' + err);
        }
    });
}

router.get('/list', (req, res) => {
    Student.find((err,docs) => {
        if(!err){
            res.render('student/list', {
                list: docs
            });
        }else{
            console.log('Error in retrieval: ' + err);
        }
    });
})

router.get('/:id', (req, res) => {
    Student.findById(req.params.id, (err,doc) => {
            if(!err){
                res.render('student/addOredit', {
                    viewTitle: "Update Student",
                    student: doc,
                });
            console.log(doc);
            }
        });
    });



router.get('/delete/:id', (req, res) => {
    Student.findByIdAndDelete(req.params.id, (err,doc) => {
        if(!err){
            res.redirect('/student/list');
        }else{
            console.log('Error in deletion: ' + err);
        }
        });
    });

        module.exports = router;