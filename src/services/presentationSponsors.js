const fs = require('fs');
const path = require('path');
const { imageSize } = require('image-size');
const puppeteer = require('puppeteer');
const AdmZip = require('adm-zip');

const IMAGES_PER_SLIDE = 6;
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.svg']);

function getSlideSize(templatePath) {
    const presentation = new AdmZip(templatePath).readAsText('ppt/presentation.xml');
    const size = presentation.match(/<p:sldSz\b[^>]*>/);
    const width = size && /\bcx="(\d+)"/.exec(size[0]);
    const height = size && /\bcy="(\d+)"/.exec(size[0]);
    if (!width || !height) throw new Error('Die Größe der Präsentationsvorlage konnte nicht gelesen werden.');
    return { width: Number(width[1]) / 914400, height: Number(height[1]) / 914400 };
}

async function loadSponsorImages(directory) {
    const files = fs.readdirSync(directory, { withFileTypes: true })
        .filter(entry => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
        .map(entry => entry.name)
        .sort((a, b) => a.localeCompare(b, 'de'));
    let browser;
    try {
        const images = [];
        for (const name of files) {
            const filePath = path.join(directory, name);
            const buffer = fs.readFileSync(filePath);
            const dimensions = imageSize(buffer);
            if (!dimensions.width || !dimensions.height) throw new Error(`Ungültige Bildgröße: ${name}`);

            if (path.extname(name).toLowerCase() === '.svg') {
                if (!browser) browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
                const page = await browser.newPage();
                try {
                    const width = 1600;
                    const height = Math.max(1, Math.round(width * dimensions.height / dimensions.width));
                    await page.setViewport({ width, height });
                    await page.setContent(`<style>html,body{margin:0}img{display:block;width:${width}px;height:${height}px}</style><img src="data:image/svg+xml;base64,${buffer.toString('base64')}">`);
                    await page.$eval('img', image => image.decode());
                    const png = await page.screenshot({ type: 'png', omitBackground: true });
                    images.push({ name, data: `image/png;base64,${Buffer.from(png).toString('base64')}`, ratio: width / height });
                } finally {
                    await page.close();
                }
            } else {
                images.push({ name, path: filePath, ratio: dimensions.width / dimensions.height });
            }
        }
        return images;
    } finally {
        if (browser) await browser.close();
    }
}

function layoutSponsorImages(images, slideSize) {
    const pages = [];
    for (let start = 0; start < images.length; start += IMAGES_PER_SLIDE) {
        const page = images.slice(start, start + IMAGES_PER_SLIDE);
        const columns = Math.min(3, page.length);
        const rows = Math.ceil(page.length / columns);
        const marginX = slideSize.width * 0.015;
        const top = slideSize.height * 0.27;
        const bottom = slideSize.height * 0.05;
        const cellWidth = (slideSize.width - 2 * marginX) / columns;
        const cellHeight = (slideSize.height - top - bottom) / rows;
        const height = Math.min(cellHeight * 0.96, ...page.map(image => cellWidth * 0.99 / image.ratio));

        pages.push(page.map((image, index) => {
            const row = Math.floor(index / columns);
            const countInRow = Math.min(columns, page.length - row * columns);
            const column = index % columns;
            const width = height * image.ratio;
            return {
                ...image,
                x: (slideSize.width - countInRow * cellWidth) / 2 + column * cellWidth + (cellWidth - width) / 2,
                y: top + row * cellHeight + (cellHeight - height) / 2,
                w: width,
                h: height
            };
        }));
    }
    return pages;
}

function addSponsorSlides(presentation, pages, teamCount) {
    for (const page of pages) {
        presentation.addSlide('slide', 3, slide => {
            slide.generate(generated => {
                for (const image of page) {
                    const { x, y, w, h, name } = image;
                    const source = image.data ? { data: image.data } : { path: image.path };
                    generated.addImage({ ...source, x, y, w, h, altText: name });
                }
            });
        });
    }

    if (pages.length) {
        presentation.modify(xml => {
            const slides = Array.from(xml.getElementsByTagName('p:sldId'));
            const originalCount = slides.length - pages.length - teamCount;
            if (originalCount < 3) throw new Error('Die Präsentationsvorlage enthält keine dritte Folie.');
            const original = slides[2];
            for (const slide of slides.slice(originalCount, originalCount + pages.length)) {
                original.parentNode.insertBefore(slide, original);
            }
            original.parentNode.removeChild(original);
        });
    }
}

module.exports = { getSlideSize, loadSponsorImages, layoutSponsorImages, addSponsorSlides };
