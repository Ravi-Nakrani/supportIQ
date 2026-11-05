import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const monorepoRoot = path.resolve(__dirname, '..');
const frontendDist = path.resolve(monorepoRoot, 'frontend/dist');

console.log('='.repeat(70));
console.log(' SupportIQ — Production Bundle Security Scanner');
console.log('='.repeat(70));
console.log(`Inspecting frontend build directory: ${frontendDist}`);

if (!fs.existsSync(frontendDist)) {
  console.error(`\n[SECURITY SCAN ERROR] Target directory does not exist: "${frontendDist}"`);
  console.error('The bundle scanner requires fresh production build artifacts.');
  console.error('Please run "npm run build:all" before running "npm run verify:bundle-security".\n');
  process.exit(1);
}

// Secret detection patterns
const SECRET_RULES = [
  {
    name: 'OpenAI Secret API Key',
    regex: /sk-[a-zA-Z0-9_-]{20,}/g,
  },
  {
    name: 'MongoDB Connection String with Credentials',
    regex: /mongodb(?:\+srv)?:\/\/[^\s"']+/g,
  },
  {
    name: 'Private Server Environment Key: MONGODB_URI',
    regex: /MONGODB_URI/g,
  },
  {
    name: 'Private Server Environment Key: OPENAI_API_KEY',
    regex: /OPENAI_API_KEY/g,
  },
  {
    name: 'Private Server Environment Key: DAILY_MAX_BUDGET_MICRO_USD',
    regex: /DAILY_MAX_BUDGET_MICRO_USD/g,
  },
];

function getAllFiles(dirPath, arrayOfFiles = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  }

  return arrayOfFiles;
}

const allFiles = getAllFiles(frontendDist);
console.log(`Discovered ${allFiles.length} file(s) in frontend/dist/ to inspect.`);

let totalBytesScanned = 0;
const violations = [];

for (const filePath of allFiles) {
  const relativePath = path.relative(monorepoRoot, filePath);
  const ext = path.extname(filePath).toLowerCase();

  // Inspect web source and map files
  if (!['.js', '.mjs', '.html', '.css', '.json', '.map'].includes(ext)) {
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  totalBytesScanned += Buffer.byteLength(content, 'utf8');

  for (const rule of SECRET_RULES) {
    rule.regex.lastIndex = 0;
    const matches = content.match(rule.regex);
    if (matches && matches.length > 0) {
      violations.push({
        file: relativePath,
        rule: rule.name,
        matchCount: matches.length,
        sample: matches[0].length > 40 ? `${matches[0].substring(0, 37)}...` : matches[0],
      });
    }
  }
}

console.log(`Scanned ${(totalBytesScanned / 1024).toFixed(2)} KB of emitted bundle assets.`);

if (violations.length > 0) {
  console.error('\n' + '!'.repeat(70));
  console.error(' [SECURITY VIOLATION] SENSITIVE TOKENS OR SERVER SECRETS FOUND IN BUNDLE:');
  console.error('!'.repeat(70));
  for (const v of violations) {
    console.error(` - File: ${v.file}`);
    console.error(`   Rule: ${v.rule}`);
    console.error(`   Occurrences: ${v.matchCount}`);
    console.error(`   Sample: ${v.sample}`);
  }
  console.error('\nBuild security audit FAILED. Secrets must never be bundled into client assets.');
  process.exit(1);
}

console.log('\n[SECURITY SCAN PASSED] Zero secrets, connection strings, or private keys found in frontend/dist.');
console.log('='.repeat(70));
process.exit(0);

