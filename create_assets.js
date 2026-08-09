const fs = require('fs');

// Minimal valid 1x1 green PNG (properly formatted)
const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNMy/j/HwAFcwLR2UFETAAAAABJRU5ErkJggg==',
  'base64'
);

// Create a simple 1024x1024 green PNG using ImageMagick or a simpler approach
// We'll use a properly formed minimal PNG and let expo handle the rest
fs.writeFileSync('assets/icon.png', png1x1);
fs.writeFileSync('assets/splash-icon.png', png1x1);
fs.writeFileSync('assets/favicon.png', png1x1);
console.log('Placeholder assets created');
