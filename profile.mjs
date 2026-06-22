import puppeteer from 'puppeteer-core';
import {createWriteStream} from 'fs';
import {resolve} from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_URL = 'http://localhost:3001';
const OUTPUT = resolve('profile-trace.json');

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox'],
  });

  const pages = await browser.pages();
  const page = pages[0];
  const cdp = await page.target().createCDPSession();

  // Navigate to the app
  await page.goto(APP_URL, {waitUntil: 'networkidle0'});
  console.log('--- App loaded. Interact with the app normally. When lag occurs, press Enter in this terminal to stop profiling. ---');

  // Start Tracing
  await cdp.send('Tracing.start', {
    categories: '-*,blink,blink.console,disabled-by-default-blink.debug,toplevel,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,disabled-by-default-devtools.timeline.stack,v8,v8.execute,disabled-by-default-v8.cpu_profiler,disabled-by-default-v8.cpu_profiler.hires',
    transferMode: 'ReturnAsStream',
  });

  // Also capture performance.measure data via console
  const measures = [];

  // Wait for user to press Enter
  await new Promise(resolve => {
    process.stdin.once('data', () => resolve());
  });

  // Stop Tracing
  const traceChunks = [];
  cdp.on('Tracing.dataCollected', data => {
    if (data.value) traceChunks.push(...data.value);
  });
  await cdp.send('Tracing.end');

  // Wait a moment for remaining data
  await new Promise(r => setTimeout(r, 2000));

  // Collect performance.measure entries from the page
  const measureData = await page.evaluate(() => {
    const entries = performance.getEntriesByType('measure');
    return entries.map(e => ({
      name: e.name,
      duration: e.duration,
      startTime: e.startTime,
    }));
  });

  // Save trace
  const ws = createWriteStream(OUTPUT);
  ws.write(JSON.stringify(traceChunks, null, 1));
  ws.end();
  console.log(`Trace saved to ${OUTPUT}`);

  // Print measure summary
  if (measureData.length) {
    const groups = {};
    for (const m of measureData) {
      if (!groups[m.name]) groups[m.name] = [];
      groups[m.name].push(m.duration);
    }
    console.log('\n=== performance.measure summary ===');
    for (const [name, durations] of Object.entries(groups)) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const max = Math.max(...durations);
      const min = Math.min(...durations);
      console.log(`${name}: count=${durations.length}, avg=${avg.toFixed(1)}ms, max=${max.toFixed(1)}ms, min=${min.toFixed(1)}ms`);
    }

    // Find the single longest measure
    measureData.sort((a, b) => b.duration - a.duration);
    console.log('\n=== Top 10 longest measures ===');
    for (const m of measureData.slice(0, 10)) {
      console.log(`${m.duration.toFixed(1)}ms  ${m.name}`);
    }
  } else {
    console.log('No performance.measure entries found.');
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => {console.error(e); process.exit(1);});
