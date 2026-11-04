const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Team = mongoose.model('Team');
const { commonMiddleware } = require('../middleware/auth');
const puppeteer = require('puppeteer');
const Automizer = require('pptx-automizer').default;
const { modify } = require('pptx-automizer');
const { ModifyShapeHelper } = require('pptx-automizer');
const sizeOf = require('image-size');
const { ZipArchive } = require('archiver');
const { PDFDocument } = require('pdf-lib');
const multer = require('multer');

commonMiddleware(router, ['admin']);

router.get('/', async (req, res) => {
    const teams = await Team.find({}).sort({ finalPlacement: 1 });
    res.render('layouts/certificate', { teams });
});

async function generateCertificatePdf(team, outputPath) {
    const templatePath = path.join(__dirname, '../../public/templates/certificate_template.html');
    if (!fs.existsSync(templatePath)) throw new Error('Template not found: certificate_template.html');

    const imageToBase64 = (imagePath) => {
        if (!fs.existsSync(imagePath)) return '';
        const imageBuffer = fs.readFileSync(imagePath);
        const ext = path.extname(imagePath).toLowerCase();
        const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : ext === '.svg' ? 'image/svg+xml' : 'image/png';
        return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    };

    let htmlContent = fs.readFileSync(templatePath, 'utf8');
    const publicDir = path.join(__dirname, '../../public');
    const templatesDir = path.join(publicDir, 'templates');

    htmlContent = htmlContent.replace(/src="logo\.png"/g, `src="${imageToBase64(path.join(templatesDir, 'logo.png'))}"`);
    htmlContent = htmlContent.replace(/src="skyline\.png"/g, `src="${imageToBase64(path.join(templatesDir, 'skyline.png'))}"`);
    htmlContent = htmlContent.replace(/{{TEAM_NAME}}/g, team.name || '');
    htmlContent = htmlContent.replace(/{{RANK}}/g, (team.finalPlacement || '').toString());
    const goals = Array.isArray(team.goals) ? team.goals : [];
    const drinks = team.drinksCount || {};
    const drinkStat = [
        drinks.weizen ? `Weizen: ${drinks.weizen}` : '',
        drinks.pils ? `Pils: ${drinks.pils}` : ''
    ].filter(Boolean).join(' | ');
    const stats = [
        team.group ? `Gruppe ${team.group}` : '',
        team.gamesPlayed ? `Spiele: ${team.gamesPlayed}` : '',
        (team.gamesWon || team.gamesLost) ? `Siege: ${team.gamesWon || 0} / Niederlagen: ${team.gamesLost || 0}` : '',
        (goals[0] || goals[1]) ? `Geschossen: ${goals[0] || 0} / ${goals[1] || 0} Kassiert` : '',
        team.sektWon ? `Sekt erhalten: ${team.sektWon}` : '',
        drinkStat
    ];
    for (let i = 1; i <= 6; i++) {
        htmlContent = htmlContent.replace(`{{STAT_${i}}}`, stats[i - 1]);
    }
    htmlContent = htmlContent.replace(/{{IMAGE_URL}}/g, () => team.imageDataUrl || (team.imagePath ? imageToBase64(path.join(publicDir, team.imagePath)) : ''));

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        await page.pdf({ path: outputPath, format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    } finally {
        await browser.close();
    }
}

router.post('/generateCertificate', async (req, res) => {
    try {
        const team = await Team.findById(req.body.teamId).exec();
        if (!team) return res.status(404).send('Team not found');

        const certificatesDir = path.join(__dirname, '../../public/certificates/');
        if (!fs.existsSync(certificatesDir)) fs.mkdirSync(certificatesDir, { recursive: true });

        const sanitizedName = `${team.finalPlacement}_${team.name}_certificate`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '_').replace(/\.+$/, '');
        const pdfPath = path.join(certificatesDir, `${sanitizedName}.pdf`);

        await generateCertificatePdf(team, pdfPath);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${sanitizedName}.pdf"`);
        res.sendFile(pdfPath, () => setTimeout(() => fs.existsSync(pdfPath) && fs.unlinkSync(pdfPath), 5000));
    } catch (err) {
        console.error('Error generating certificate:', err);
        res.status(500).send('Error generating certificate: ' + err.message);
    }
});

router.post('/generateAllCertificates', async (req, res) => {
    try {
        const teams = await Team.find({ finalPlacement: { $ne: null } }).sort({ finalPlacement: 1 }).exec();
        if (!teams || teams.length === 0) return res.status(404).send('Keine Teams mit Platzierung gefunden');

        const tempDir = path.join(__dirname, '../../public/certificates/temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const pdfPaths = [];
        for (const team of teams) {
            const sanitizedName = `${team.finalPlacement}_${team.name}_certificate`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '_').replace(/\.+$/, '');
            const pdfPath = path.join(tempDir, `${sanitizedName}.pdf`);
            await generateCertificatePdf(team, pdfPath);
            pdfPaths.push({ path: pdfPath, name: `${sanitizedName}.pdf` });
        }

        const zipFileName = `Urkunden_${new Date().toISOString().replace(/:/g, '-').split('.')[0]}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

        const archive = new ZipArchive({ zlib: { level: 9 } });
        archive.on('error', (err) => { throw err; });
        archive.pipe(res);

        for (const file of pdfPaths) {
            archive.file(file.path, { name: file.name });
        }

        await archive.finalize();

        setTimeout(() => {
            pdfPaths.forEach(file => fs.existsSync(file.path) && fs.unlinkSync(file.path));
        }, 5000);
    } catch (err) {
        console.error('Fehler beim Generieren der Urkunden-ZIP:', err);
        res.status(500).send('Fehler beim Generieren der Urkunden-ZIP: ' + err.message);
    }
});

const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype))
});

router.post('/generateManualCertificate', imageUpload.single('image'), async (req, res) => {
    let pdfPath;
    try {
        const b = req.body;
        const num = (v) => (v === undefined || v === '' ? undefined : Number(v));
        const team = {
            name: (b.name || '').trim(),
            finalPlacement: b.rank ? String(b.rank).trim() : '',
            group: (b.group || '').trim(),
            gamesPlayed: num(b.gamesPlayed),
            gamesWon: num(b.gamesWon),
            gamesLost: num(b.gamesLost),
            goals: [num(b.goalsFor) || 0, num(b.goalsAgainst) || 0],
            sektWon: num(b.sektWon),
            drinksCount: { weizen: num(b.weizen) || 0, pils: num(b.pils) || 0 }
        };
        if (!team.name) return res.status(400).send('Teamname fehlt');
        if (req.file) team.imageDataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

        const tempDir = path.join(__dirname, '../../public/certificates/temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        pdfPath = path.join(tempDir, `manual_${Date.now()}.pdf`);
        await generateCertificatePdf(team, pdfPath);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="Urkunde.pdf"');
        res.sendFile(pdfPath, () => fs.existsSync(pdfPath) && fs.unlinkSync(pdfPath));
    } catch (err) {
        console.error('Error generating manual certificate:', err);
        if (pdfPath && fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        res.status(500).send('Error generating manual certificate: ' + err.message);
    }
});

router.post('/generateAllCertificatesPdf', async (req, res) => {
    const tempFiles = [];
    try {
        const teams = await Team.find({ finalPlacement: { $ne: null } }).sort({ finalPlacement: 1 }).exec();
        if (!teams || teams.length === 0) return res.status(404).send('Keine Teams mit Platzierung gefunden');

        const tempDir = path.join(__dirname, '../../public/certificates/temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const merged = await PDFDocument.create();
        for (const team of teams) {
            const pdfPath = path.join(tempDir, `merge_${team._id}_${Date.now()}.pdf`);
            tempFiles.push(pdfPath);
            await generateCertificatePdf(team, pdfPath);
            const doc = await PDFDocument.load(fs.readFileSync(pdfPath));
            const pages = await merged.copyPages(doc, doc.getPageIndices());
            pages.forEach(p => merged.addPage(p));
        }

        const bytes = await merged.save();
        const fileName = `Urkunden_${new Date().toISOString().replace(/:/g, '-').split('.')[0]}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(Buffer.from(bytes));
    } catch (err) {
        console.error('Fehler beim Generieren der Sammel-PDF:', err);
        res.status(500).send('Fehler beim Generieren der Sammel-PDF: ' + err.message);
    } finally {
        tempFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
    }
});

router.post('/generatePresentation', async (req, res) => {
    try {
        const teams = await Team.find().exec();
        teams.sort((a, b) => {
            if (a.finalPlacement === null) return 1;
            if (b.finalPlacement === null) return -1;
            return a.finalPlacement - b.finalPlacement;
        });

        const templatePath = path.join(__dirname, '../../public/templates/template.pptx');
        const outputDir = path.join(__dirname, '../../public/presentations');
        const fileName = 'teams_presentation_' + new Date().toISOString().replace(/:/g, '-') + '.pptx';

        if (!fs.existsSync(templatePath)) throw new Error('Template not found: template.pptx');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const automizer = new Automizer({
            templateDir: path.join(__dirname, '../../public/templates'),
            outputDir: outputDir,
            mediaDir: path.join(__dirname, '../../public/teampictures'),
            removeExistingSlides: false,
            autoImportSlideMasters: true,
            autoImportLayouts: true,
        });

        let pres = automizer.loadRoot('template.pptx', 'presentation').load('template.pptx', 'slide');
        const teamTemplateSlideNr = 4;

        for (const team of teams) {
            pres = pres.addSlide('slide', teamTemplateSlideNr, async (slide) => {
                slide.useSlideLayout();
                slide.modifyElement('{team}', [modify.setText(team.name)]);
                slide.modifyElement('{rank}', [modify.setText(team.finalPlacement + ".")]);

                const imagePath = path.join(__dirname, '../../public/', team.imagePath || '/teampictures/default.jpg');
                if (!fs.existsSync(imagePath)) throw new Error(`Image not found: ${imagePath}`);
                
                pres.loadMedia(path.basename(imagePath));
                const dimensions = sizeOf(imagePath);
                const placeholder = await slide.getElement('{image}');
                const newHeight = placeholder.position.cy;
                const newWidth = newHeight * (dimensions.width / dimensions.height);
                const newX = placeholder.position.x - (newWidth - placeholder.position.cx) / 2;

                slide.modifyElement('{image}', [
                    ModifyShapeHelper.setPosition({ x: newX, y: placeholder.position.y, w: newWidth, h: newHeight }),
                    modify.setRelationTarget(path.basename(imagePath)),
                ]);
            });
        }

        await pres.write(fileName);
        res.download(path.join(outputDir, fileName));
    } catch (error) {
        console.error('Fehler beim Generieren der Präsentation:', error);
        res.status(500).send('Fehler beim Generieren der Präsentation: ' + error);
    }
});

module.exports = router;
module.exports.generateCertificatePdf = generateCertificatePdf;