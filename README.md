# wsop

Small Node.js automation scripts for WSOP reward links using Playwright.

## What this repo does

- `index.js` opens a persistent Chromium profile, waits for you to sign in to WSOP, scrapes reward links from `https://freechipswsop.com/`, and visits each unclaimed link.
- `generate.js` generates random `wsopga.me` codes and checks whether they resolve.
- `claimed.json` stores links that have already been processed so repeated runs can skip them.
- `browser-profile/` stores the Chromium user data directory so login state survives between runs.

## Requirements

- Node.js 18+
- npm

## Install

```bash
npm install
```

If Playwright browsers were not installed during `npm install`, run:

```bash
npx playwright install chromium
```

## Usage

Run the main claim flow:

```bash
npm run claim
```

What happens:

1. Chromium opens with the local persistent profile in `browser-profile/`.
2. The script loads `https://www.playwsop.com/play`.
3. You sign in manually if needed, then press Enter in the terminal.
4. The script scrapes reward links from `https://freechipswsop.com/`.
5. A link is only written to `claimed.json` after it lands back on a WSOP URL.

Generate and verify random codes:

```bash
npm run generate
```

Test a custom number of random codes:

```bash
node generate.js 250
```

The default is `100` codes when no argument is provided.

`generate.js` treats a code as valid only when it redirects to `playwsop.com`, so it relies on the persisted login state in `browser-profile/`.

Run the built-in syntax check before committing:

```bash
npm test
```

## Project files

- `index.js` - interactive reward claiming flow
- `generate.js` - random code generation and verification
- `claimed.json` - saved claimed or discovered URLs
- `browser-profile/` - persistent Playwright browser profile

## Notes

- `claimed.json` and `browser-profile/` are local runtime data and are ignored by Git.
- If you want to restart from a clean login session, remove the contents of `browser-profile/`.
- If you want to reprocess links from scratch, remove `claimed.json`.
- `npm test` runs a basic syntax check for the two entry-point scripts.