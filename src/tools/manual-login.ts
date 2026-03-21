import { browserManager } from '../browser/browser-manager.js';

const LOGIN_URL = 'https://www.upwork.com/ab/account-security/login';
const log = (...args: unknown[]) => console.error('[ManualLogin]', ...args);

/**
 * Opens a visible browser window and waits for the user to manually complete login
 * (including any CAPTCHA/2FA). Saves the session when done.
 */
export async function manualLogin(): Promise<{ success: boolean; message: string }> {
  // Force headless=false for manual login
  if (browserManager.isReady()) {
    await browserManager.close();
  }

  // Temporarily override headless to false
  process.env.BROWSER_HEADLESS = 'false';
  await browserManager.init();

  const page = await browserManager.newPage();

  log('Opening Upwork login page for manual login...');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  log('Waiting for user to complete login (up to 3 minutes)...');

  try {
    // Wait until user is no longer on login/security pages
    await page.waitForURL(
      (url) => {
        const s = url.toString();
        return (
          !s.includes('/login') &&
          !s.includes('/account-security') &&
          !s.includes('cf-') &&
          s.includes('upwork.com')
        );
      },
      { timeout: 180000 } // 3 minutes
    );

    const finalUrl = page.url();
    log('Login detected! URL:', finalUrl);

    // Save session for future headless use
    await browserManager.saveSession();
    await page.close();

    return {
      success: true,
      message: `Login successful! Session saved. You can now use all tools. Final URL: ${finalUrl}`,
    };
  } catch {
    const url = page.url();
    await page.close();
    return {
      success: false,
      message: `Login timeout or failed. Current URL: ${url}. Please try again.`,
    };
  }
}
