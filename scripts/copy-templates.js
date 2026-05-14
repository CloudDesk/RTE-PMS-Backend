const fs = require('fs');
const path = require('path');

// Source and destination directories
const sourceDir = path.join(__dirname, '..', 'src', 'emails', 'templates');
const destDir = path.join(__dirname, '..', 'dist', 'emails', 'templates');

// Create destination directory if it doesn't exist
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
  console.log(`Created directory: ${destDir}`);
}

// Copy all .hbs files
function copyTemplates() {
  try {
    if (!fs.existsSync(sourceDir)) {
      console.error(`Source directory does not exist: ${sourceDir}`);
      return;
    }

    const files = fs.readdirSync(sourceDir);
    let copiedCount = 0;

    files.forEach(file => {
      if (file.endsWith('.hbs')) {
        const sourcePath = path.join(sourceDir, file);
        const destPath = path.join(destDir, file);
        
        fs.copyFileSync(sourcePath, destPath);
        console.log(`Copied: ${file}`);
        copiedCount++;
      }
    });

    console.log(`Successfully copied ${copiedCount} template files to ${destDir}`);
  } catch (error) {
    console.error('Error copying templates:', error);
    process.exit(1);
  }
}

copyTemplates(); 