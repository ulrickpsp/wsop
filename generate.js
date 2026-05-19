const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const USER_DATA_DIR = path.join(__dirname, 'browser-profile');
const CLAIMED_FILE = path.join(__dirname, 'claimed.json');

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

// Generar un código aleatorio de 6 caracteres
function generateCode() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Verificar si un código es válido accediendo a la URL
async function verifyCode(page, code) {
  const url = `https://www.wsopga.me/${code}`;
  let navigationError = null;

  try {
    await page.goto(url, { waitUntil: 'commit', timeout: 10000 });
  } catch (err) {
    navigationError = err;
  }

  await page.waitForTimeout(1500);

  const finalUrl = page.url();
  const isValid = isWsopUrl(finalUrl);

  if (isValid) {
    console.log(`✓ ${code} → ${finalUrl}`);
    return true;
  }

  if (navigationError) {
    console.log(`✗ ${code} → ${finalUrl} (${navigationError.message.split('\n')[0]})`);
  } else {
    console.log(`✗ ${code} → ${finalUrl}`);
  }

  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const parsedCount = Number.parseInt(args[0], 10);
  const numCodes = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 100;

  console.log(`\n🎲 Generando y verificando ${numCodes} códigos aleatorios...\n`);

  const claimedSet = loadClaimed();
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
  });

  try {
    const page = await context.newPage();

    let found = 0;
    const validCodes = [];

    for (let i = 0; i < numCodes; i++) {
      const code = generateCode();

      // Saltar si ya está reclamado
      if (claimedSet.has(`https://www.wsopga.me/${code}`)) {
        console.log(`⊘ ${code} → Ya reclamado`);
        continue;
      }

      const isValid = await verifyCode(page, code);

      if (isValid) {
        validCodes.push(`https://www.wsopga.me/${code}`);
        claimedSet.add(`https://www.wsopga.me/${code}`);
        found++;
        console.log(`🎉 ¡ENCONTRADO! ${code}`);
      }

      // Pausa para no sobrecargar el servidor
      await page.waitForTimeout(500);
    }

    saveClaimed(claimedSet);

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`✅ Códigos válidos encontrados: ${found}`);
    console.log(`📊 Total reclamados ahora: ${claimedSet.size}`);
    console.log(`${'─'.repeat(50)}\n`);

    if (validCodes.length > 0) {
      console.log('Códigos válidos:');
      validCodes.forEach(code => console.log(`  → ${code}`));
    }
  } finally {
    await context.close();
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
