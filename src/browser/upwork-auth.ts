import { Page } from 'playwright';
import { browserManager } from './browser-manager.js';

const log = (...args: unknown[]) => console.error('[UpworkAuth]', ...args);

/**
 * Returns a ready Upwork page.
 * Connects via CDP (existing Chrome) or loads saved session.
 * Throws if neither is available — user must run connect-chrome.bat or manual_login first.
 */
export async function ensureLoggedIn(): Promise<Page> {
  await browserManager.init();
  const page = await browserManager.newPage();

  log(`Browser ready (mode: ${browserManager.getMode()})`);

  // Quick check — navigate home if page is blank
  if (!page.url() || page.url() === 'about:blank') {
    await page.goto('https://www.upwork.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
  }

  return page;
}

/** Random delay between min and max ms */
export function humanDelay(min: number, max: number): Promise<void> {
  return new Promise(resolve =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min) + min))
  );
}
