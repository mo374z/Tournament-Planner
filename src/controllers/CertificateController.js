const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const ImageModule = require('docxtemplater-image-module-free');
const sizeOf = require('image-size');
const mongoose = require('mongoose');
const Team = mongoose.model('Team');
const { getRank } = require('../models/Team');


//Code part to enable the authentication for all the following routes
const  {verifyToken, checkLoginStatus , isAdmin}=  require('../middleware/auth'); // Pfad zur auth.js-Datei
const cookieParser = require('cookie-parser'); 
router.use(cookieParser());                 // Add cookie-parser middleware to parse cookies

router.use(verifyToken);                    // Alle nachfolgenden Routen sind nur für angemeldete Benutzer zugänglich
router.use((req, res, next) => {            // Middleware, um Benutzerinformationen an res.locals anzuhängen
    res.locals.username = req.username;
    res.locals.userrole = req.userRole;
    next();
  });

  router.use(isAdmin);                       // Alle nachfolgenden Routen sind nur für Admins zugänglich
//--------------------------------------------------------------


//Generate the certificate and download it bzw. save it on the server in the folder public/certificates
//uses https://www.npmjs.com/package/docxtemplater-image-module-free 

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        //Check if the folder exists, if not create it
        if (!fs.existsSync(path.join(__dirname, '../../public/templates/'))) {
            fs.mkdirSync(path.join(__dirname, '../../public/templates/'), { recursive: true });
        }
        cb(null, 'public/templates/');
    },
    filename: function (req, file, cb) {
        cb(null, 'template.docx');
    }
});

const upload = multer({ storage: storage });

router.get('/', async (req, res) => {
    const teams = await Team.find({});
    //ad the rank to the team object
    for (let i = 0; i < teams.length; i++) {
        teams[i].rank = await getRank(teams[i]);
    }
    //sort the teams by rank
    teams.sort((a, b) => a.rank - b.rank);
    const templateExists = fs.existsSync(path.join(__dirname, '../../public/templates/template.docx'));
    res.render('layouts/certificate', { teams, templateExists });
});

router.get('/downloadTemplate', (req, res) => {
    const templatePath = path.join(__dirname, '../../public/templates/template.docx');
    if (fs.existsSync(templatePath)) {
        res.download(templatePath);
    } else {
        res.status(404).send('Template not found');
    }
});

router.post('/uploadTemplate', upload.single('template'), (req, res) => {
    res.redirect('/certificate');
});

router.post('/generate', async (req, res) => {
    const { teamId } = req.body;
    const team = await Team.findById(teamId).exec();
    const rank = await getRank(team);
    const templatePath = path.join(__dirname, '../../public/templates/template.docx');
    const templateBytes = fs.readFileSync(templatePath);

    // Load the Word document
    const zip = new PizZip(templateBytes);
    const imageModule = new ImageModule({
        centered: true, // Center the image
        getImage: function(tagValue) {
            return fs.readFileSync(tagValue);
        },
        getSize: function(img, tagValue, tagName) {
            //Image in a 4/3 aspect ratio
            //Image size (width, height) in twips
            const width = 580;
            return [width, width * 3 / 4];
        }
    });
    const doc = new Docxtemplater(zip, {
        modules: [imageModule],
        paragraphLoop: true,
        linebreaks: true,
    });

    // Replace placeholders with actual data
    const placeholders = {
        teamName: team.name,
        group: team.group,
        rank: rank.toString(),
        image: path.join(__dirname, '../../public', team.imagePath || '/teampictures/default.jpg')
    };

    doc.render(placeholders);

    const buffer = doc.getZip().generate({ type: 'nodebuffer' });

    // Save the certificate to the server
    //Check if the folder exists, if not create it
    if (!fs.existsSync(path.join(__dirname, '../../public/certificates/'))) {
        fs.mkdirSync(path.join(__dirname, '../../public/certificates/'), { recursive: true });
    }
    const outputPath = path.join(__dirname, '../../public/certificates/', `${team.name}_certificate.docx`);
    fs.writeFileSync(outputPath, buffer);

    res.download(outputPath);
});

module.exports = router;