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
const { commonMiddleware } = require('../middleware/auth');
const Automizer = require('pptx-automizer').default;
const { modify } = require('pptx-automizer');

commonMiddleware(router, ['admin']); // Only admins can access the certificate page

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
            //Get the size of the image
            const dimensions = sizeOf(img);
            // console.log('Image dimensions:', dimensions);
            // Calculate the aspect ratio of the image
            const aspectRatio = dimensions.width / dimensions.height;
            const maxHeight = 450; // Maximum height of the image
            return [maxHeight * aspectRatio, maxHeight]; // Return the width and height
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
    const outputPath = path.join(__dirname, '../../public/certificates/', `${rank}_${team.name}_certificate.docx`);
    fs.writeFileSync(outputPath, buffer);

    res.download(outputPath);
});

router.post('/generatePresentation', async (req, res) => {
    try {
        console.log('Start generating presentation...');
        const teams = await Team.find().exec();
        for (let i = 0; i < teams.length; i++) {
            teams[i].rank = await getRank(teams[i]);
        }
        teams.sort((a, b) => a.rank - b.rank);

        const templatePath = path.join(__dirname, '../../public/templates/template.pptx');
        const outputDir = path.join(__dirname, '../../public/presentations');
        const fileName = 'teams_presentation_' + new Date().toISOString().replace(/:/g, '-') + '.pptx';
        const outputPath = path.join(outputDir, fileName);

        if (!fs.existsSync(templatePath)) {
            throw new Error('Template not found: template.pptx');
        }


        console.log('Templates found:', templatePath);

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const automizer = new Automizer({
            templateDir: path.join(__dirname, '../../public/templates'),
            outputDir: outputDir,
            mediaDir: path.join(__dirname, '../../public/teampictures'),
            removeExistingSlides: false,
            autoImportSlideMasters: true,
            autoImportLayouts: true,
        });

        let pres = automizer.loadRoot('template.pptx', 'presentation')
                            //.load('templateSlide.pptx', 'slide');
                            .load('template.pptx', 'slide');

        const teamTemplateSlideNr = 4; // Slide number in the template presentation that will be used to create the new slides

        for (const team of teams) {
            //const team = teams[0]; //for testing purposes
            console.log(`Adding slide for team: ${team.name}`);
            pres = pres.addSlide('slide', teamTemplateSlideNr, async (slide) => {
                slide.useSlideLayout(); // Use the original layout from the source template
                
                // Replace placeholders with actual data
                slide.modifyElement('{team}', [modify.setText(team.name)]);
                slide.modifyElement('{rank}', [modify.setText(team.rank + ".")]);

                const imagePath = path.join(__dirname, '../../public/', team.imagePath || '/teampictures/default.jpg');
                // Prüfen, ob die Datei existiert
                if (!fs.existsSync(imagePath)) {
                    throw new Error(`Image not found: ${imagePath}`);
                }
                else
                {
                    //console.log('Team Image found:', imagePath);
                    pres.loadMedia(path.basename(imagePath)); // Load the image to the presentation
                }
                // Setzen des Bilds auf den Platzhalter
                slide.modifyElement('{image}', [
                    modify.setRelationTarget(path.basename(imagePath)) // Nur den Dateinamen verwenden
                ]);

            });
        }

        console.log('Writing presentation to file...');
        await pres.write(fileName); // Write the presentation to a file (path is outputDir)
        console.log('Presentation written to file:', outputPath);

        res.download(outputPath);
    } catch (error) {
        console.error('Fehler beim Generieren der Präsentation:', error);
        res.status(500).send('Fehler beim Generieren der Präsentation: ' + error);
    }
});

module.exports = router;