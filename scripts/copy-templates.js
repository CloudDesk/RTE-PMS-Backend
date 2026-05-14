const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const copyJobs = [
  {
    from: path.join(rootDir, 'src', 'emails', 'templates'),
    to: path.join(distDir, 'emails', 'templates'),
    filter: (source) => !source.endsWith('.ts'),
  },
  {
    from: path.join(rootDir, 'templates'),
    to: path.join(distDir, 'templates'),
  },
  {
    from: path.join(rootDir, 'src', 'public'),
    to: path.join(distDir, 'public'),
  },
];

function copyRecursive(source, destination, filter = () => true) {
  if (!fs.existsSync(source)) {
    return;
  }

  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });

    for (const entry of fs.readdirSync(source)) {
      copyRecursive(
        path.join(source, entry),
        path.join(destination, entry),
        filter,
      );
    }

    return;
  }

  if (!filter(source)) {
    return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

for (const job of copyJobs) {
  copyRecursive(job.from, job.to, job.filter);
}

console.log('Template and public assets copied to dist.');
