import { Page } from 'playwright';
import { browserManager } from './browser-manager.js';
import { config } from '../config.js';

const log = (...args: unknown[]) => console.error('[UpworkAuth]', ...args);

const UPWORK_HOME = 'https://www.upwork.com';
const LOGIN_URL = 'https://www.upwork.com/ab/account-security/login';

export async function ensureLoggedIn(): Promise<Page> {
  // Try loading existing session
  if (!browserManager.isReady()) {
    const sessionLoaded = await browserManager.loadSession();
    if (!sessionLoaded) {
      await browserManager.init();
    }
  }

  const page = await browserManager.newPage();

  // Check if already logged in
  if (await isLoggedIn(page)) {
    log('Already logged in via saved session.');
    return page;
  }

  // Session expired or not found — perform fresh login
  log('Session not valid. Performing login...');
  await login(page);
  await browserManager.saveSession();

  return page;
}

async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto(UPWORK_HOME, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // If we see the "Find Work" nav or profile menu, we're in
    const loggedInIndicators = [
      '[data-test="nav-find-work"]',
      '[data-test="nav-header-dropdown"]',
      'nav [aria-label="My Upwork"]',
      '.up-avatar',
    ];
    for (const selector of loggedInIndicators) {
      if (await page.locator(selector).first().isVisible({ timeout: 3000 }).catch(() => false)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function login(page: Page): Promise<void> {
  log('Navigating to login page...');
  await page.goto(LOGIN_URL, { waitUntil: 'load', timeout: 40000 });
  await humanDelay(2000, 3000);

  // Step 1: Enter email — wait for ANY input to appear first, then identify it
  const emailSelectors = [
    '#login_username',
    'input[name="login[username]"]',
    'input[autocomplete="username"]',
    '[data-qa="username"]',
    'input[type="email"]',
    'input[inputmode="username email"]',
  ];

  let emailSelector = '';
  // Try waitForSelector with longer timeout for each candidate
  for (const sel of emailSelectors) {
    try {
      await page.waitForSelector(sel, { state: 'attached', timeout: 5000 });
      emailSelector = sel;
      log('Found email input (attached):', sel);
      break;
    } catch {
      // try next
    }
  }
  if (!emailSelector) {
    // Last resort: dump all inputs on page for debugging
    const inputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map((el) => ({
        id: el.id, name: el.name, type: el.type, placeholder: el.placeholder,
      }))
    );
    log('Inputs found on page:', JSON.stringify(inputs));
    throw new Error(`Login failed: could not find email input. Inputs: ${JSON.stringify(inputs)}`);
  }

  log('Waiting for email input to be enabled...');
  // Try waiting naturally first (5s), then force-enable if still disabled
  const enabledNaturally = await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      return el !== null && !el.disabled;
    },
    emailSelector,
    { timeout: 5000 }
  ).then(() => true).catch(() => false);

  if (!enabledNaturally) {
    log('Input still disabled — force-enabling via JS...');
    await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (el) {
        el.removeAttribute('disabled');
        el.removeAttribute('readonly');
      }
    }, emailSelector);
    await humanDelay(500, 800);
  }

  log('Email input ready.');
  await page.locator(emailSelector).first().click();
  await humanType(page, emailSelector, config.upwork.email);
  await humanDelay(800, 1200);

  // Click continue / next button
  const continueBtnSelectors = [
    '#login_password_continue',
    'button[data-qa="btn-next"]',
    'button[type="submit"]',
    'button:has-text("Continue")',
    'button:has-text("Next")',
  ];
  for (const sel of continueBtnSelectors) {
    const visible = await page.locator(sel).first().isVisible({ timeout: 2000 }).catch(() => false);
    if (visible) {
      await page.locator(sel).first().click();
      break;
    }
  }
  await humanDelay(2000, 3000);

  // Step 2: Enter password
  const passwordSelectors = [
    '#login_password',
    'input[name="login[password]"]',
    'input[type="password"]',
    '[data-qa="password"]',
  ];

  let passwordSelector = '';
  for (const sel of passwordSelectors) {
    const visible = await page.locator(sel).first().isVisible({ timeout: 3000 }).catch(() => false);
    if (visible) { passwordSelector = sel; break; }
  }
  if (!passwordSelector) {
    throw new Error('Login failed: could not find password input after email step.');
  }

  log('Found password input:', passwordSelector);
  await page.locator(passwordSelector).first().click();
  await humanType(page, passwordSelector, config.upwork.password);
  await humanDelay(800, 1200);

  // Click login button
  const loginBtnSelectors = [
    '#login_control_continue',
    'button[data-qa="btn-auth"]',
    'button[type="submit"]',
    'button:has-text("Log In")',
    'button:has-text("Sign In")',
  ];
  for (const sel of loginBtnSelectors) {
    const visible = await page.locator(sel).first().isVisible({ timeout: 2000 }).catch(() => false);
    if (visible) {
      await page.locator(sel).first().click();
      break;
    }
  }

  // Wait for redirect — accept any post-login URL
  try {
    await page.waitForURL(
      (url) => !url.toString().includes('/login') && !url.toString().includes('/account-security'),
      { timeout: 25000 }
    );
    log('Login successful! URL:', page.url());
  } catch {
    const url = page.url();
    if (url.includes('security') || url.includes('2fa') || url.includes('otp')) {
      throw new Error(
        'Login blocked: 2FA / security check required. Please login manually once, then reuse the saved session.'
      );
    }
    if (url.includes('captcha')) {
      throw new Error('Login blocked: CAPTCHA detected. Please solve it manually first.');
    }
    log('Login redirect timeout — current URL:', url, '(may still be OK)');
  }
}

/** Simulate human typing with random delays between keystrokes */
async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.fill(selector, ''); // Clear first
  for (const char of text) {
    await page.type(selector, char, { delay: Math.random() * 80 + 40 });
  }
}

/** Random delay between min and max ms */
export function humanDelay(min: number, max: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min) + min))
  );
}
