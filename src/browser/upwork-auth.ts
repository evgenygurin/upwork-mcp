import { Page } from 'playwright';
import { browserManager } from './browser-manager.js';
import { config } from '../config.js';

const log = (...args: unknown[]) => console.error('[UpworkAuth]', ...args);

async function doLogin(page: Page): Promise<boolean> {
  log('Attempting programmatic login...');
  await page.goto('https://www.upwork.com/ab/account-security/login', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Enter email
  const emailInput = page.locator('input[name="login[username]"]');
  if (!await emailInput.isVisible({ timeout: 10000 }).catch(() => false)) {
    log('Email input not found on login page');
    return false;
  }
  await emailInput.fill(config.upwork.email);
  await page.click('button[data-ev-label="auth_submit_button"], button[type="submit"]');
  await humanDelay(2000, 3000);

  // Enter password if prompted
  const passwordInput = page.locator('input[name="login[password]"], input[type="password"]');
  if (await passwordInput.isVisible({ timeout: 8000 }).catch(() => false)) {
    await passwordInput.fill(config.upwork.password);
    await page.click('button[data-ev-label="auth_submit_button"], button[type="submit"]');
    await humanDelay(3000, 5000);
  }

  // Check if we landed on a non-login page
  const currentUrl = page.url();
  const loggedIn = !currentUrl.includes('/login') && !currentUrl.includes('account-security/login');
  log(loggedIn ? 'Login successful' : `Login may have failed, url: ${currentUrl}`);

  if (loggedIn) {
    await browserManager.saveSession();
  }

  return loggedIn;
}

/**
 * Returns a ready Upwork page, auto-logging in if needed.
 */
export async function ensureLoggedIn(): Promise<Page> {
  await browserManager.init();
  const page = await browserManager.newPage();

  log('Browser ready');

  await page.goto('https://www.upwork.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for Cloudflare challenge to resolve (up to 15s)
  await waitForCloudflare(page);

  const url = page.url();

  if (url.includes('/login') || url.includes('account-security')) {
    log('Not logged in — attempting auto login');
    const ok = await doLogin(page);
    if (!ok) {
      const finalUrl = page.url();
      throw new Error(
        `Auto-login failed. Current URL: ${finalUrl}. ` +
        `Upwork may require CAPTCHA or 2FA — use manual_login instead.`
      );
    }
    // Navigate home after login
    await page.goto('https://www.upwork.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  return page;
}

/** Random delay between min and max ms */
export function humanDelay(min: number, max: number): Promise<void> {
  return new Promise(resolve =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min) + min))
  );
}

/** Wait for Cloudflare challenge to pass (polls title for up to maxMs) */
async function waitForCloudflare(page: Page, maxMs = 15000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const title = await page.title().catch(() => '');
    if (!title.toLowerCase().includes('just a moment') && !title.toLowerCase().includes('cloudflare')) {
      return;
    }
    log('Waiting for Cloudflare challenge...');
    await humanDelay(2000, 3000);
  }
  log('Cloudflare challenge did not resolve in time — proceeding anyway');
}
