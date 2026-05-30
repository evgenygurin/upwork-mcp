import { Page } from 'playwright';
import { browserManager } from './browser-manager.js';
import { config } from '../config.js';

const log = (...args: unknown[]) => console.error('[UpworkAuth]', ...args);

/**
 * Returns a ready, logged-in Upwork page.
 *
 * In proxy mode (PROXY_URL set):
 *   - Loads saved session automatically on first call.
 *   - If session is missing or expired, auto-logs in with UPWORK_EMAIL/PASSWORD.
 *   - Saves session to disk after successful login.
 *
 * In CDP mode (no PROXY_URL):
 *   - Connects to existing Chrome via CDP.
 *   - Assumes user is already logged in; run manual_login if not.
 */
export async function ensureLoggedIn(): Promise<Page> {
  await browserManager.init();
  const page = await browserManager.newPage();

  log('Browser ready');

  if (!page.url() || page.url() === 'about:blank') {
    await page.goto('https://www.upwork.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  }

  if (browserManager.isProxyMode()) {
    const loggedIn = await checkLoggedIn(page);
    if (!loggedIn) {
      await autoLogin(page);
    }
  }

  return page;
}

async function checkLoggedIn(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes('/login') || url.includes('account-security')) return false;
  const indicator = await page.$(
    '[data-test="visit-profile-main"], [data-test="up-header-visitor-login"], .up-avatar, [data-test="nav-logged-in"]'
  ).catch(() => null);
  return !indicator; // if login button found, we are NOT logged in
}

async function autoLogin(page: Page): Promise<void> {
  log('Auto-login with credentials...');

  await page.goto('https://www.upwork.com/ab/account-security/login', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Stealth plugin handles Cloudflare — wait for the email field
  const emailInput = await page.waitForSelector('#login_username', { timeout: 20000 }).catch(() => null);
  if (!emailInput) {
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
    throw new Error(
      `Login form not found — Cloudflare may be blocking the proxy IP.\n` +
      `Page content: ${bodyText}\n` +
      `Try a different residential proxy or log in manually via manual_login.`
    );
  }

  await page.fill('#login_username', config.upwork.email);
  await humanDelay(600, 1200);
  await page.click('#login_password_continue');

  await page.waitForSelector('#login_password', { timeout: 10000 });
  await page.fill('#login_password', config.upwork.password);
  await humanDelay(600, 1200);
  await page.click('#login_control_continue');

  await page.waitForURL(
    url => !url.href.includes('/login') && !url.href.includes('account-security'),
    { timeout: 30000 }
  ).catch(async () => {
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
    throw new Error(`Login failed — Upwork response: ${bodyText}`);
  });

  log('Auto-login successful:', page.url());
  await browserManager.saveSession();
}

export function humanDelay(min: number, max: number): Promise<void> {
  return new Promise(resolve =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min) + min))
  );
}
