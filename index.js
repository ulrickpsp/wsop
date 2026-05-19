const { chromium } = require('playwright');
const readline = require('readline');
const path      = require('path');
const fs        = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
const WAIT_BETWEEN_LINKS_MS = 15000;  // time on each reward page before moving on
const WSOP_LOGIN_URL        = 'https://www.playwsop.com/play';
const SOURCE_URL            = 'https://freechipswsop.com/';
const USER_DATA_DIR         = path.join(__dirname, 'browser-profile');
const CLAIMED_FILE          = path.join(__dirname, 'claimed.json');
// ─────────────────────────────────────────────────────────────────────────────

function isWsopUrl(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === 'playwsop.com' || hostname.endsWith('.playwsop.com');
  } catch {
    return false;
  }
}

function loadClaimed() {
  if (!fs.existsSync(CLAIMED_FILE)) return new Set();
  try {
    return new Set(JSON.parse(fs.readFileSync(CLAIMED_FILE, 'utf8')));
  } catch {
    return new Set();
  }
}

function saveClaimed(claimed) {
  fs.writeFileSync(CLAIMED_FILE, JSON.stringify([...claimed], null, 2));
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

async function scrapeLinks(page) {
  console.log('\n📡 Scraping reward links from freechipswsop.com …');
  await page.goto(SOURCE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const links = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll('a[href*="wsopga.me"]')];
    // deduplicate
    const seen = new Set();
    return anchors
      .map(a => ({ href: a.href.trim(), text: a.textContent.trim() }))
      .filter(({ href }) => {
        if (seen.has(href)) return false;
        seen.add(href);
        return true;
      });
  });

  console.log(`✅ Found ${links.length} unique reward links.\n`);
  // Reverse so we start from the oldest links (bottom of the page) first
  return links.reverse();
}

async function claimLink(page, { href, text }, index, total) {
  console.log(`\n[${index + 1}/${total}] ${text}`);
  console.log(`       → ${href}`);

  let navigationError = null;

  try {
    await page.goto(href, { waitUntil: 'commit', timeout: 20000 });
  } catch (err) {
    // timeout or redirect errors are common — just log and continue
    navigationError = err;
    console.log(`       ⚠️  Navigation timeout/error: ${err.message.split('\n')[0]}`);
  }

  // Give the page time to load and potentially trigger the in-game reward
  await page.waitForTimeout(WAIT_BETWEEN_LINKS_MS);

  const landedUrl = page.url();
  const claimed = isWsopUrl(landedUrl);

  console.log(`       📍 Landed on: ${landedUrl}`);
  if (navigationError && claimed) {
    console.log('       ℹ️  Reached WSOP despite the navigation error; keeping it as claimed.');
  }
  if (!claimed) {
    console.log('       ↩️  Did not reach WSOP; leaving this link unclaimed for a future retry.');
  }

  return { claimed, landedUrl };
}

async function main() {
  // launchPersistentContext keeps a real browser profile on disk —
  // cookies, localStorage, IndexedDB all survive between runs.
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  try {
    const page = await context.newPage();

    // ── Step 1: Open WSOP and wait for user to log in / confirm ──────────
    console.log('\n🌐 Opening WSOP — log in if needed, then press ENTER here to start claiming.');
    await page.goto(WSOP_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await prompt('\n⏳ Press ENTER when ready…');

    // ── Step 2: Scrape links ───────────────────────────────────────────────
    const allLinks = await scrapeLinks(page);

    if (allLinks.length === 0) {
      console.error('❌ No links found. The page structure may have changed.');
      return;
    }

    // ── Step 3: Filter already-claimed ─────────────────────────────────────
    const claimedSet = loadClaimed();
    const links = allLinks.filter(({ href }) => !claimedSet.has(href));
    const skipped = allLinks.length - links.length;

    if (skipped > 0) console.log(`⏭️  Skipping ${skipped} already-claimed link(s).`);
    if (links.length === 0) {
      console.log('🎉 All links already claimed. Nothing to do!');
      return;
    }

    // ── Step 4: Iterate ────────────────────────────────────────────────────
    console.log(`\n🚀 Claiming ${links.length} new rewards (${WAIT_BETWEEN_LINKS_MS / 1000}s per link)…`);
    console.log(`   Estimated time: ~${Math.ceil((links.length * WAIT_BETWEEN_LINKS_MS) / 60000)} minutes\n`);

    let claimed = 0;
    let failed  = 0;

    for (let i = 0; i < links.length; i++) {
      try {
        const result = await claimLink(page, links[i], i, links.length);

        if (!result.claimed) {
          failed++;
          continue;
        }

        claimedSet.add(links[i].href);
        saveClaimed(claimedSet);   // persist after each success
        claimed++;
      } catch (err) {
        console.log(`       ❌ Error: ${err.message.split('\n')[0]}`);
        failed++;
      }
    }

    // ── Done ───────────────────────────────────────────────────────────────
    console.log('\n──────────────────────────────────────────');
    console.log(`✅ Done!  Claimed: ${claimed}  |  Skipped: ${skipped}  |  Failed: ${failed}`);
    console.log(`Total claimed ever: ${claimedSet.size}`);
    console.log('──────────────────────────────────────────\n');

    await prompt('Press ENTER to close the browser…');
  } finally {
    await context.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
