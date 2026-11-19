const fs = require('fs');
const path = require('path');

const htmlFiles = fs.readdirSync('.').filter(f => f.endsWith('.html'));
console.log('Verifying SEO tags across', htmlFiles.length, 'HTML files...\n');

let issues = 0;
htmlFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const titles = content.match(/<title>[\s\S]*?<\/title>/gi) || [];
  const descs = content.match(/<meta\s+name=["']description["'][\s\S]*?>/gi) || [];
  const canonicals = content.match(/<link\s+rel=["']canonical["'][\s\S]*?>/gi) || [];
  const ogTitles = content.match(/<meta\s+property=["']og:title["'][\s\S]*?>/gi) || [];
  const ogDescs = content.match(/<meta\s+property=["']og:description["'][\s\S]*?>/gi) || [];

  let status = 'OK';
  const problems = [];
  if (titles.length !== 1) problems.push(`title tags: ${titles.length}`);
  if (descs.length !== 1) problems.push(`meta description: ${descs.length}`);
  if (canonicals.length !== 1) problems.push(`canonical link: ${canonicals.length}`);
  if (ogTitles.length !== 1) problems.push(`og:title: ${ogTitles.length}`);
  if (ogDescs.length !== 1) problems.push(`og:description: ${ogDescs.length}`);

  if (problems.length > 0) {
    status = 'WARN/FAIL: ' + problems.join(', ');
    issues++;
  }

  console.log(`- ${file.padEnd(25)} : ${status}`);
});

console.log(`\nVerification finished with ${issues} issue(s).`);

