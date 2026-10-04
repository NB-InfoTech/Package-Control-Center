const fs = require('fs');
const path = require('path');

function createICO(pngFiles, outputPath) {
  const ICONDIR = Buffer.alloc(6);
  ICONDIR.writeUInt16LE(0, 0); // Reserved (0)
  ICONDIR.writeUInt16LE(1, 2); // Type (1 = ICO)
  ICONDIR.writeUInt16LE(pngFiles.length, 4); // Number of images

  let offset = 6 + pngFiles.length * 16;
  const imageDataBuffers = [];
  const dirEntries = [];

  for (const pngFile of pngFiles) {
    const pngData = fs.readFileSync(pngFile);
    const size = path.basename(pngFile).match(/icon-(\d+)\.png/);
    const dimension = size ? parseInt(size[1]) : 0;
    
    // ICO format uses 0 for 256px
    const width = dimension === 256 ? 0 : dimension;
    const height = dimension === 256 ? 0 : dimension;
    
    const dirEntry = Buffer.alloc(16);
    dirEntry.writeUInt8(width, 0); // Width
    dirEntry.writeUInt8(height, 1); // Height
    dirEntry.writeUInt8(0, 2); // Color count (0 = no palette)
    dirEntry.writeUInt8(0, 3); // Reserved
    dirEntry.writeUInt16LE(1, 4); // Color planes
    dirEntry.writeUInt16LE(32, 6); // Bits per pixel
    dirEntry.writeUInt32LE(pngData.length, 8); // Size of image data
    dirEntry.writeUInt32LE(offset, 12); // Offset of image data
    
    dirEntries.push(dirEntry);
    imageDataBuffers.push(pngData);
    offset += pngData.length;
  }

  const icoBuffer = Buffer.concat([
    ICONDIR,
    ...dirEntries,
    ...imageDataBuffers
  ]);

  fs.writeFileSync(outputPath, icoBuffer);
  console.log(`ICO created at ${outputPath}`);
}

const pngFiles = [
  'icon-16.png',
  'icon-32.png',
  'icon-48.png',
  'icon-64.png',
  'icon-128.png',
  'icon-256.png'
].map(f => path.join(__dirname, f));

createICO(pngFiles, path.join(__dirname, 'icon.ico'));