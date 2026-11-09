const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const handlebars = require('handlebars');
const puppeteer = require('puppeteer');
const AdmZip = require('adm-zip');
const crypto = require('crypto');
const Automizer = require('pptx-automizer').default;
const { getSlideSize, loadSponsorImages, layoutSponsorImages, addSponsorSlides } = require('../src/services/presentationSponsors');
const env = require('./helpers/testEnv');
const certificateRouter = require('../src/controllers/CertificateController');

describe('Presentation slide order', function () {
  const teams = Array.from({ length: 16 }, (_, index) => ({
    _id: String(index + 1).padStart(24, '0'),
    name: `Testmannschaft ${index + 1}`,
    finalPlacement: index + 1
  }));
  let browser;
  let page;
  let server;
  let originalFind;
  let base;

  before(async function () {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    page = await browser.newPage();
    const template = fs.readFileSync(path.join(env.ROOT, 'src', 'views', 'layouts', 'certificate.hbs'), 'utf8');
    await page.setContent(handlebars.compile(template)({ teams }));

    originalFind = env.Team.find;
    env.Team.find = () => ({ exec: async () => teams.slice() });
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use('/certificate', certificateRouter);
    server = await new Promise(resolve => {
      const instance = app.listen(0, () => resolve(instance));
    });
    base = `http://127.0.0.1:${server.address().port}/certificate/generatePresentation`;
  });

  after(async function () {
    if (originalFind) env.Team.find = originalFind;
    if (server) await new Promise(resolve => server.close(resolve));
    if (browser) await browser.close();
  });

  async function currentOrder() {
    return page.$$eval('#presentationOrder input', inputs => inputs.map(input => Number(input.value)));
  }

  it('applies both presets and supports individual moves', async function () {
    assert.deepStrictEqual(await currentOrder(), Array.from({ length: 16 }, (_, i) => 16 - i));
    await page.select('#presentationPreset', 'special');
    assert.deepStrictEqual(await currentOrder(), [...Array.from({ length: 12 }, (_, i) => 15 - i), 16, 3, 2, 1]);
    await page.$eval('#presentationOrder li:first-child .move-down', button => button.click());
    assert.deepStrictEqual((await currentOrder()).slice(0, 3), [14, 15, 13]);
    assert.strictEqual(await page.$eval('#presentationPreset', select => select.value), 'custom');
    await page.select('#presentationPreset', 'descending');
    assert.deepStrictEqual(await currentOrder(), Array.from({ length: 16 }, (_, i) => 16 - i));
    await page.$eval('#presentationOrderModal', modal => { modal.style.display = 'block'; });
    await page.$eval('#presentationOrder', list => {
      const source = list.children[0];
      const target = list.children[2];
      const dataTransfer = new DataTransfer();
      source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer, clientY: target.getBoundingClientRect().bottom - 1 }));
      source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
    });
    assert.deepStrictEqual((await currentOrder()).slice(0, 3), [15, 14, 16]);
    assert.strictEqual(await page.$eval('#presentationPreset', select => select.value), 'custom');
  });

  it('keeps teams without a placement in both presets', async function () {
    const template = fs.readFileSync(path.join(env.ROOT, 'src', 'views', 'layouts', 'certificate.hbs'), 'utf8');
    await page.close();
    page = await browser.newPage();
    await page.setContent(handlebars.compile(template)({ teams: [teams[0], { _id: '99', name: 'Offen', finalPlacement: null }, teams[15]] }));
    assert.deepStrictEqual(await currentOrder(), [16, 1, 99]);
    await page.select('#presentationPreset', 'special');
    assert.deepStrictEqual(await currentOrder(), [16, 1, 99]);
  });

  it('rejects stale, repeated and unknown team IDs', async function () {
    for (const order of [
      [teams[0]._id],
      teams.map(() => teams[0]._id),
      [...teams.slice(0, 15).map(team => team._id), 'unknown']
    ]) {
      const body = new URLSearchParams();
      order.forEach(id => body.append('teamOrder', id));
      const response = await fetch(base, { method: 'POST', headers: { Cookie: env.adminCookie() }, body });
      assert.strictEqual(response.status, 400);
      assert.match(await response.text(), /Reihenfolge/);
    }
  });

  it('generates the PowerPoint in the submitted order', async function () {
    const template = fs.readFileSync(path.join(env.ROOT, 'src', 'views', 'layouts', 'certificate.hbs'), 'utf8');
    await page.close();
    page = await browser.newPage();
    await page.setContent(handlebars.compile(template)({ teams }));
    await page.select('#presentationPreset', 'special');
    await page.$eval('#presentationOrder li:first-child .move-down', button => button.click());
    const order = await currentOrder();
    const encoded = await page.$eval('#presentationForm', form => new URLSearchParams(new FormData(form)).toString());
    const body = new URLSearchParams(encoded);
    const response = await fetch(base, { method: 'POST', headers: { Cookie: env.adminCookie() }, body });
    if (!response.ok) assert.fail(`Presentation generation failed (${response.status}): ${await response.text()}`);
    const fileName = /filename="([^"]+)"/.exec(response.headers.get('content-disposition'))[1];
    try {
      const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
      const presentation = zip.readAsText('ppt/presentation.xml');
      const relations = zip.readAsText('ppt/_rels/presentation.xml.rels');
      const targets = new Map(Array.from(relations.matchAll(/<Relationship\b([^>]+)\/>/g), match => {
        const attrs = match[1];
        return [/\bId="([^"]+)"/.exec(attrs)?.[1], /\bTarget="([^"]+)"/.exec(attrs)?.[1]];
      }));
      const slideIds = Array.from(presentation.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g), match => match[1]);
      const slides = slideIds.map(id => zip.readAsText('ppt/' + targets.get(id)));
      const sponsorDir = path.join(env.ROOT, 'public', 'images', 'carousel');
      const sponsorImages = await loadSponsorImages(sponsorDir);
      const sponsorCount = Math.ceil(sponsorImages.length / 6);
      const sponsorSlides = slides.slice(2, 2 + sponsorCount);
      assert.strictEqual(sponsorSlides.length, sponsorCount);
      for (const slide of sponsorSlides) assert.match(slide, /Sponsoren/);
      assert.strictEqual(sponsorSlides.reduce((sum, slide) => sum + (slide.match(/<p:pic\b/g) || []).length, 0),
        sponsorImages.length + sponsorCount, 'sponsor images and existing slide logos');
      const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
      const mediaHashes = new Set(zip.getEntries().filter(entry => entry.entryName.startsWith('ppt/media/'))
        .map(entry => digest(entry.getData())));
      for (const image of sponsorImages) {
        assert.ok(sponsorSlides.some(slide => slide.includes(image.name)), `missing sponsor ${image.name}`);
        const content = image.data ? Buffer.from(image.data.split(',')[1], 'base64') : fs.readFileSync(image.path);
        assert.ok(mediaHashes.has(digest(content)), `missing image data ${image.name}`);
      }
      const positions = order.map(rank => slides.findIndex(slide => slide.includes(`Testmannschaft ${rank}<`)));
      assert.ok(positions.every(index => index >= 0), 'all team slides are present');
      assert.ok(positions.every((index, i) => i === 0 || positions[i - 1] < index), `unexpected slide positions: ${positions}`);
    } finally {
      fs.unlinkSync(path.join(env.ROOT, 'public', 'presentations', fileName));
    }
  });

  it('lays out sponsors evenly without overlap and creates additional pages', function () {
    const images = Array.from({ length: 13 }, (_, index) => ({ name: String(index), ratio: index % 2 ? 2 : 1 }));
    const pages = layoutSponsorImages(images, { width: 13.333, height: 7.5 });
    assert.deepStrictEqual(pages.map(page => page.length), [6, 6, 1]);
    assert.deepStrictEqual(layoutSponsorImages([], { width: 13.333, height: 7.5 }), []);
    for (const page of pages) {
      assert.ok(page.every(image => image.h === page[0].h));
      for (const [index, image] of page.entries()) {
        assert.ok(image.x >= 0 && image.y >= 0 && image.x + image.w <= 13.333 && image.y + image.h <= 7.5);
        for (const other of page.slice(index + 1)) {
          assert.ok(image.x + image.w <= other.x || other.x + other.w <= image.x ||
            image.y + image.h <= other.y || other.y + other.h <= image.y);
        }
      }
    }
  });

  it('makes a representative six-logo layout at least five percent taller than before', function () {
    const images = [3629 / 2042, 1280 / 720, 709 / 274, 3239 / 1519, 1364 / 790, 1022 / 1024]
      .map(ratio => ({ ratio }));
    const slide = getSlideSize(path.join(env.ROOT, 'public', 'templates', 'template.pptx'));
    const oldCellWidth = slide.width * 0.94 / 3;
    const oldCellHeight = slide.height * 0.68 / 2;
    const oldHeight = Math.min(oldCellHeight * 0.92, ...images.map(image => oldCellWidth * 0.96 / image.ratio));
    const [page] = layoutSponsorImages(images, slide);
    assert.ok(page[0].h >= oldHeight * 1.05);
    assert.ok(page.every(image => image.h === page[0].h));
  });

  it('inserts multiple sponsor slides before the remaining template and team slides', async function () {
    const templateDir = path.join(env.ROOT, 'public', 'templates');
    const imagePath = path.join(env.ROOT, 'public', 'teampictures', 'default.jpg');
    const images = Array.from({ length: 7 }, (_, index) => ({ name: `Sponsor ${index + 1}`, path: imagePath, ratio: 4 / 3 }));
    const pages = layoutSponsorImages(images, getSlideSize(path.join(templateDir, 'template.pptx')));
    const pres = new Automizer({ templateDir, removeExistingSlides: false, autoImportSlideMasters: true, autoImportLayouts: true })
      .loadRoot('template.pptx').load('template.pptx', 'slide');
    addSponsorSlides(pres, pages, 1);
    pres.addSlide('slide', 4);
    const zip = await pres.getJSZip();
    const xml = await zip.file('ppt/presentation.xml').async('string');
    const rels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
    const targets = new Map(Array.from(rels.matchAll(/<Relationship\b([^>]+)\/>/g), match => {
      const attrs = match[1];
      return [/\bId="([^"]+)"/.exec(attrs)?.[1], /\bTarget="([^"]+)"/.exec(attrs)?.[1]];
    }));
    const ids = Array.from(xml.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g), match => match[1]);
    const slides = await Promise.all(ids.map(id => zip.file('ppt/' + targets.get(id)).async('string')));
    assert.strictEqual(slides.length, 6);
    assert.match(slides[2], /Sponsor 1/);
    assert.match(slides[3], /Sponsor 7/);
    assert.ok(!slides[4].includes('Sponsor 7'));
    assert.ok(!slides[5].includes('Sponsor 7'));
  });
});
