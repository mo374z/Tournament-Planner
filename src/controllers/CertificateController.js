const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');
const mongoose = require('mongoose');
const Team = mongoose.model('Team');
const { commonMiddleware } = require('../middleware/auth');
const Automizer = require('pptx-automizer').default;
const { modify } = require('pptx-automizer');
const { ModifyShapeHelper } = require('pptx-automizer');
const sizeOf = require('image-size');

commonMiddleware(router, ['admin']); 


router.get('/', async (req, res) => {
    const teams = await Team.find({}).sort({ finalPlacement: 1 });
    const templateExists = fs.existsSync(path.join(__dirname, '../../public/templates/template_budeturnier_2026.odt'));
    res.render('layouts/certificate', { teams, templateExists });
});

async function generateCertificatePdf(team, outputPath) {
    const templatePath = path.join(__dirname, '../../public/templates/template_budeturnier_2026.odt');
    
    if (!fs.existsSync(templatePath)) {
        throw new Error('Template not found: template_budeturnier_2026.odt');
    }
    
    const tempDir = path.join(__dirname, '../../public/certificates/temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempOdtPath = path.join(tempDir, `temp_${Date.now()}.odt`);
    
    try {
        fs.copyFileSync(templatePath, tempOdtPath);
        
        const extractDir = path.join(tempDir, `extract_${Date.now()}`);
        fs.mkdirSync(extractDir, { recursive: true });
        
        const zip = new AdmZip(tempOdtPath);
        zip.extractAllTo(extractDir, true);
        
        const contentXmlPath = path.join(extractDir, 'content.xml');
        let contentXml = fs.readFileSync(contentXmlPath, 'utf8');
        
        const replacements = {
            '{teamName}': team.name || '',
            '{group}': team.group || '',
            '{rank}': (team.finalPlacement || '').toString()
        };
        
        Object.keys(replacements).forEach(placeholder => {
            contentXml = contentXml.split(placeholder).join(replacements[placeholder]);
        });
        
        fs.writeFileSync(contentXmlPath, contentXml, 'utf8');
        
        if (team.imagePath) {
            const teamImagePath = path.join(__dirname, '../../public', team.imagePath);
            const picturesDir = path.join(extractDir, 'Pictures');
            
            if (fs.existsSync(teamImagePath) && fs.existsSync(picturesDir)) {
                const existingImages = fs.readdirSync(picturesDir);
                let targetImage = existingImages.find(img => img.toLowerCase().includes('placeholder'));
                if (!targetImage && existingImages.length > 0) targetImage = existingImages[0];
                
                if (targetImage) {
                    fs.copyFileSync(teamImagePath, path.join(picturesDir, targetImage));
                }
            }
        }
        
        const newZip = new AdmZip();
        
        const addDirectoryToZip = (dirPath, zipPath = '') => {
            fs.readdirSync(dirPath).forEach(item => {
                const itemPath = path.join(dirPath, item);
                const zipItemPath = zipPath ? `${zipPath}/${item}` : item;
                
                if (fs.statSync(itemPath).isDirectory()) {
                    addDirectoryToZip(itemPath, zipItemPath);
                } else {
                    newZip.addLocalFile(itemPath, zipPath);
                }
            });
        };
        
        addDirectoryToZip(extractDir);
        newZip.writeZip(tempOdtPath);
        fs.rmSync(extractDir, { recursive: true, force: true });
        
        execSync(`libreoffice --headless --convert-to pdf --outdir "${tempDir}" "${tempOdtPath}" 2>&1`, {
            timeout: 30000,
            encoding: 'utf8'
        });
        
        const pdfFile = fs.readdirSync(tempDir).find(f => f.endsWith('.pdf'));
        
        if (pdfFile) {
            fs.renameSync(path.join(tempDir, pdfFile), outputPath);
        } else {
            throw new Error('PDF conversion failed');
        }
    } finally {
        if (fs.existsSync(tempOdtPath)) fs.unlinkSync(tempOdtPath);
    }
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../../public/templates/');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, 'template_budeturnier_2026.odt')
});

const upload = multer({ storage });

router.get('/downloadTemplate', (req, res) => {
    const templatePath = path.join(__dirname, '../../public/templates/template_budeturnier_2026.odt');
    fs.existsSync(templatePath) ? res.download(templatePath) : res.status(404).send('Template not found');
});

router.post('/uploadTemplate', upload.single('template'), (req, res) => res.redirect('/certificate'));

router.post('/generateCertificate', async (req, res) => {
    try {
        const team = await Team.findById(req.body.teamId).exec();
        if (!team) return res.status(404).send('Team not found');
        
        const certificatesDir = path.join(__dirname, '../../public/certificates/');
        if (!fs.existsSync(certificatesDir)) {
            fs.mkdirSync(certificatesDir, { recursive: true });
        }
        
        const sanitizedName = `${team.finalPlacement}_${team.name}_certificate`
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
            .replace(/^\.+/, '_')
            .replace(/\.+$/, '');
        
        const pdfPath = path.join(certificatesDir, `${sanitizedName}.pdf`);
        
        await generateCertificatePdf(team, pdfPath);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${sanitizedName}.pdf"`);
        res.sendFile(pdfPath, () => {
            setTimeout(() => fs.existsSync(pdfPath) && fs.unlinkSync(pdfPath), 5000);
        });
    } catch (err) {
        console.error('Error generating certificate:', err);
        res.status(500).send('Error generating certificate: ' + err.message);
    }
});

router.post('/generatePresentation', async (req, res) => {
    try {
        console.log('Start generating presentation...');
        const teams = await Team.find().exec();
        
        // sort teams by finalPlacement parameter
        teams.sort((a, b) => {
            if (a.finalPlacement === null) return 1;
            if (b.finalPlacement === null) return -1;
            return a.finalPlacement - b.finalPlacement;
        });

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
                slide.modifyElement('{rank}', [modify.setText(team.finalPlacement + ".")]);

                const imagePath = path.join(__dirname, '../../public/', team.imagePath || '/teampictures/default.jpg');
                if (!fs.existsSync(imagePath)) {
                    throw new Error(`Image not found: ${imagePath}`);
                } else {
                    pres.loadMedia(path.basename(imagePath)); // Load the image to the presentation
                }

                // Get the size of the image to insert
                const dimensions = sizeOf(imagePath);
                const aspectRatio = dimensions.width / dimensions.height;

                // Retrieve the placeholder position and size
                const placeholder = await slide.getElement('{image}');
                const originalPosition = {
                    x: placeholder.position.x,
                    y: placeholder.position.y,
                    width: placeholder.position.cx,
                    height: placeholder.position.cy
                };

                // Berechne die neue Breite basierend auf dem Seitenverhältnis und der Höhe des Platzhalters
                const newHeight = originalPosition.height; // Behalte die Höhe des Platzhalters bei
                const newWidth = newHeight * aspectRatio; // Berechne die neue Breite basierend auf dem Seitenverhältnis

                // Berechne die x-Position, um das Bild horizontal zu zentrieren
                const widthDifference = newWidth - originalPosition.width; // Unterschied zwischen neuer und alter Breite
                const newX = originalPosition.x - (widthDifference / 2); // Zentriere das Bild, indem der Unterschied halbiert und vom originalen x-Wert abgezogen wird

                // Setze das Bild in den Platzhalter und passe die Größe und Position an
                slide.modifyElement('{image}', [
                    ModifyShapeHelper.setPosition({
                        x: newX, // Neue x-Position (zentriert)
                        y: originalPosition.y, // Behalte die gleiche y-Position bei
                        w: newWidth, // Neue Breite basierend auf dem Seitenverhältnis
                        h: newHeight, // Behalte die gleiche Höhe bei
                    }),
                    modify.setRelationTarget(path.basename(imagePath)), // Bild zuweisen
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
module.exports.generateCertificatePdf = generateCertificatePdf;