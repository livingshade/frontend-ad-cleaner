import {spawn} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const browser = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = mkdtempSync(join(tmpdir(), 'zhihu-cleaner-test-'));
const file = fileURLToPath(new URL('./browser.html', import.meta.url));
const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', `--user-data-dir=${profile}`, '--virtual-time-budget=5000', '--dump-dom', pathToFileURL(file).href], {windowsHide:true});
let output = '', errors = '';
child.stdout.on('data', chunk => output += chunk);
child.stderr.on('data', chunk => errors += chunk);
const timeout = setTimeout(() => child.kill(), 30000);
child.on('close', code => {
  clearTimeout(timeout);
  const match = output.match(/<pre id="results">([\s\S]*?)<\/pre>/);
  if (!match) { console.error('Browser did not return test results.', code, errors.slice(-2000)); process.exitCode=1; return; }
  const report = match[1].replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
  console.log(report);
  writeFileSync(new URL('./latest-results.json', import.meta.url), report + '\n');
  process.exitCode = output.includes('data-test-result="passed"') ? 0 : 1;
});
