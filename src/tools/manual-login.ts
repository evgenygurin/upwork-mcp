import { chromium } from 'playwright';
import { browserManager } from '../browser/browser-manager.js';
import { config } from '../config.js';
import { spawn, ChildProcess } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

const LOGIN_URL = 'https://www.upwork.com/ab/account-security/login';
const CDP_PORT = 9222;
const log = (...args: unknown[]) => console.error('[ManualLogin]', ...args);

let chromeProcess: ChildProcess | null = null;

/**
 * Step 1: Launch Chrome with remote debugging port.
 * Opens Upwork login page — user completes login manually.
 * Call save_session after login is done.
 */
export async function manualLogin(): Promise<{ success: boolean; message: string }> {
  try {
    // Kill previous chrome process if any
    if (chromeProcess) {
      chromeProcess.kill();
      chromeProcess = null;
      await new Promise(r => setTimeout(r, 1000));
    }

    const tempDir = path.join(os.tmpdir(), `upwork-mcp-chrome-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    log('Launching Chrome with CDP on port', CDP_PORT, '— temp dir:', tempDir);

    const chromePath = config.browser.executablePath;
    chromeProcess = spawn(
      chromePath,
      [
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${tempDir}`,
        '--no-first-run',
        '--disable-default-apps',
        '--disable-blink-features=AutomationControlled',
        LOGIN_URL,
      ],
      { detached: false, stdio: 'ignore' }
    );

    chromeProcess.on('error', (err) => log('Chrome process error:', err.message));
    chromeProcess.on('exit', (code) => log('Chrome process exited with code:', code));

    // Wait for Chrome to start accepting CDP connections
    await new Promise(r => setTimeout(r, 3000));

    log('Chrome launched. Waiting for user to login...');

    return {
      success: true,
      message:
        'Chrome opened at Upwork login page. Please login in the Chrome window (solve any CAPTCHA, enter credentials, handle 2FA). ' +
        'When you see your Upwork dashboard, call save_session to persist the session.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('Error:', msg);
    return { success: false, message: `Failed to open Chrome: ${msg}` };
  }
}

/**
 * Step 2: Connect to Chrome via CDP, check login state, save session.
 * Call this after manually completing login in the Chrome window.
 */
export async function saveSession(): Promise<{ success: boolean; message: string }> {
  try {
    log('Connecting to Chrome via CDP on port', CDP_PORT);

    let browser;
    try {
      browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`, { timeout: 10000 });
    } catch {
      return {
        success: false,
        message: `Cannot connect to Chrome (port ${CDP_PORT}). Make sure you called manual_login first and Chrome is still open.`,
      };
    }

    const contexts = browser.contexts();
    if (!contexts.length) {
      return { success: false, message: 'No browser context found. Try calling manual_login again.' };
    }

    const context = contexts[0];
    const pages = context.pages();
    const page = pages.length > 0 ? pages[pages.length - 1] : await context.newPage();

    // Navigate to upwork home to check login state
    if (!page.url().includes('upwork.com')) {
      await page.goto('https://www.upwork.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
    }

    const url = page.url();
    log('Current URL:', url);

    const isLoggedIn =
      url.includes('upwork.com') &&
      !url.includes('/login') &&
      !url.includes('/account-security');

    if (!isLoggedIn) {
      await browser.close();
      return {
        success: false,
        message: `Not logged in yet. Current URL: ${url}. Please complete login in the Chrome window first, then call save_session again.`,
      };
    }

    // Save storage state (cookies + localStorage)
    const { mkdirSync } = await import('fs');
    mkdirSync(path.dirname(config.session.file), { recursive: true });
    await context.storageState({ path: config.session.file });
    log('Session saved to', config.session.file);

    await browser.close();

    // Kill the helper Chrome process
    if (chromeProcess) {
      chromeProcess.kill();
      chromeProcess = null;
    }

    return {
      success: true,
      message: `Session saved to ${config.session.file}. All tools are now ready — they will use this saved session automatically.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to save session: ${msg}` };
  }
}
