const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Read the SVG
const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'));

// Generate PNG at multiple sizes
const sizes = [16, 32, 48, 64, 128, 256];

async function generateIcons() {
  for (const size of sizes) {
    const buf = await sharp(svg)
      .resize(size, size)
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(__dirname, `icon-${size}.png`), buf);
    console.log(`Generated icon-${size}.png`);
  }
  
  console.log('All PNG icons generated');
}

generateIcons().catch(console.error);