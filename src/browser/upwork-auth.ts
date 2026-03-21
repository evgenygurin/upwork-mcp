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
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await humanDelay(1000, 2000);

  // Step 1: Enter email
  const emailInput = page.locator('#login_username');
  await emailInput.waitFor({ timeout: 10000 });
  await emailInput.click();
  await humanType(page, '#login_username', config.upwork.email);
  await humanDelay(500, 1000);

  const continueBtn = page.locator('#login_password_continue');
  await continueBtn.click();
  await humanDelay(1500, 2500);

  // Step 2: Enter password
  const passwordInput = page.locator('#login_password');
  await passwordInput.waitFor({ timeout: 10000 });
  await passwordInput.click();
  await humanType(page, '#login_password', config.upwork.password);
  await humanDelay(500, 1000);

  const loginBtn = page.locator('#login_control_continue');
  await loginBtn.click();

  // Wait for either logged-in state or 2FA
  try {
    await page.waitForURL('**/nx/find-work/**', { timeout: 20000 });
    log('Login successful!');
  } catch {
    // Check for CAPTCHA or 2FA
    const url = page.url();
    if (url.includes('security')) {
      throw new Error(
        'Login blocked: Security check / 2FA required. Please login manually and save the session.'
      );
    }
    if (url.includes('captcha')) {
      throw new Error('Login blocked: CAPTCHA detected. Please solve it manually.');
    }
    log('Login may have succeeded (unexpected redirect to:', url, ')');
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
