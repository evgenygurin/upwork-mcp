import { browserManager } from '../browser/browser-manager.js';

const LOGIN_URL = 'https://www.upwork.com/ab/account-security/login';
const log = (...args: unknown[]) => console.error('[ManualLogin]', ...args);

/**
 * Step 1: Opens a visible browser window pointing at Upwork login page.
 * Returns immediately — user must complete login themselves.
 * Call save_session after login is done.
 */
export async function manualLogin(): Promise<{ success: boolean; message: string }> {
  try {
    if (browserManager.isReady()) {
      await browserManager.close();
    }

    process.env.BROWSER_HEADLESS = 'false';
    await browserManager.init();

    const page = await browserManager.newPage();
    log('Opening Upwork login page...');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Don't close page — keep browser open for user to interact
    return {
      success: true,
      message:
        'Browser is open at Upwork login page. Please complete login (solve CAPTCHA, enter credentials, handle 2FA). ' +
        'When you are fully logged in and can see your dashboard, call the save_session tool.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to open browser: ${msg}` };
  }
}

/**
 * Step 2: Checks current browser state and saves session if logged in.
 * Call this after manually completing login in the browser window.
 */
export async function saveSession(): Promise<{ success: boolean; message: string }> {
  try {
    if (!browserManager.isReady()) {
      return {
        success: false,
        message: 'Browser is not open. Call manual_login first to open the browser.',
      };
    }

    const context = browserManager.getContext();
    const pages = context.pages();

    if (pages.length === 0) {
      return { success: false, message: 'No open pages found. Call manual_login first.' };
    }

    const page = pages[pages.length - 1];
    const url = page.url();
    log('Current URL:', url);

    // Check if we're past the login/security flow
    const isLoggedIn =
      !url.includes('/login') &&
      !url.includes('/account-security') &&
      !url.includes('cf-') &&
      url.includes('upwork.com');

    if (!isLoggedIn) {
      return {
        success: false,
        message: `Not logged in yet. Current URL: ${url}. Please complete login in the browser window first.`,
      };
    }

    await browserManager.saveSession();
    log('Session saved!');

    return {
      success: true,
      message: `Session saved successfully! Current URL: ${url}. All tools are now ready to use.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to save session: ${msg}` };
  }
}
