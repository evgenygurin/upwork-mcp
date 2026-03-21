import { chromium } from 'playwright';
import { browserManager } from '../browser/browser-manager.js';
import { config } from '../config.js';
import path from 'path';

const CDP_URL = `http://localhost:${process.env.CDP_PORT ?? '9222'}`;
const log = (...args: unknown[]) => console.error('[ManualLogin]', ...args);

/**
 * Connects to existing Chrome via CDP and saves the session.
 * Requires Chrome to be running with --remote-debugging-port=9222.
 * Run connect-chrome.bat first if not already done.
 */
export async function manualLogin(): Promise<{ success: boolean; message: string }> {
  try {
    log('Connecting to Chrome via CDP at', CDP_URL);
    const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 });
    const contexts = browser.contexts();

    if (!contexts.length) {
      await browser.close();
      return { success: false, message: 'Connected to Chrome but no context found. Make sure Upwork is open in a tab.' };
    }

    const context = contexts[0];
    const pages = context.pages();
    const upworkPage = pages.find(p => p.url().includes('upwork.com'))
      ?? pages[pages.length - 1];

    const url = upworkPage?.url() ?? '';
    log('Found page:', url);

    // Navigate to upwork home to confirm login state
    if (upworkPage && !url.includes('upwork.com')) {
      await upworkPage.goto('https://www.upwork.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    }

    const finalUrl = upworkPage?.url() ?? '';
    const isLoggedIn = finalUrl.includes('upwork.com') && !finalUrl.includes('/login');

    if (!isLoggedIn) {
      await browser.close();
      return {
        success: false,
        message: `Chrome is connected but not logged in to Upwork. URL: ${finalUrl}. Please login to Upwork in Chrome first.`,
      };
    }

    // Save session
    const fs = await import('fs');
    fs.mkdirSync(path.dirname(config.session.file), { recursive: true });
    await context.storageState({ path: config.session.file });
    log('Session saved to', config.session.file);

    await browser.close();

    return {
      success: true,
      message: `Connected to Chrome and saved session from: ${finalUrl}. All tools are now ready!`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('connect') || msg.includes('ECONNREFUSED') || msg.includes('timeout')) {
      return {
        success: false,
        message:
          'Cannot connect to Chrome. Chrome is not running with --remote-debugging-port=9222.\n' +
          'Fix: Run "connect-chrome.bat" in the upwork-mcp folder, then call manual_login again.',
      };
    }
    return { success: false, message: `Error: ${msg}` };
  }
}

/**
 * Alias kept for backwards compatibility.
 */
export async function saveSession(): Promise<{ success: boolean; message: string }> {
  return manualLogin();
}
