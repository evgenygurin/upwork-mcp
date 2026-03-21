import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { config } from '../config.js';

const log = (...args: unknown[]) => console.error('[BrowserManager]', ...args);
const CDP_URL = `http://localhost:${process.env.CDP_PORT ?? '9222'}`;

class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private mode: 'cdp' | 'session' | 'none' = 'none';

  /** Try CDP first, then session file, then error */
  async init(): Promise<void> {
    if (this.context) return;

    // 1. Try connecting to running Chrome via CDP
    const cdpConnected = await this._tryConnectCDP();
    if (cdpConnected) return;

    // 2. Try loading saved session
    const sessionLoaded = await this._tryLoadSession();
    if (sessionLoaded) return;

    throw new Error(
      'No browser connection available.\n' +
      'Option A (recommended): Run connect-chrome.bat to restart Chrome with CDP, then retry.\n' +
      'Option B: Call manual_login to open Chrome and login, then call save_session.'
    );
  }

  private async _tryConnectCDP(): Promise<boolean> {
    try {
      log('Trying CDP connection at', CDP_URL, '...');
      const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 3000 });
      const contexts = browser.contexts();
      if (!contexts.length) {
        await browser.close();
        return false;
      }
      this.browser = browser as unknown as Browser;
      this.context = contexts[0];
      this.mode = 'cdp';
      log('Connected to existing Chrome via CDP.');
      return true;
    } catch {
      log('CDP not available — Chrome may not have --remote-debugging-port=9222');
      return false;
    }
  }

  private async _tryLoadSession(): Promise<boolean> {
    try {
      const { existsSync } = await import('fs');
      if (!existsSync(config.session.file)) return false;

      log('Loading saved session from', config.session.file);
      this.browser = await chromium.launch({
        headless: config.browser.headless,
        executablePath: config.browser.executablePath || undefined,
        args: ['--disable-blink-features=AutomationControlled'],
      });
      this.context = await this.browser.newContext({
        storageState: config.session.file,
        userAgent: config.browser.userAgent,
        viewport: config.browser.viewport,
        locale: 'en-US',
        timezoneId: 'America/New_York',
      });
      await this._applyStealthPatches();
      this.mode = 'session';
      log('Session loaded. Mode: headless with saved cookies.');
      return true;
    } catch (err) {
      log('Session load failed:', err);
      return false;
    }
  }

  private async _applyStealthPatches(): Promise<void> {
    if (!this.context) return;
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
    });
  }

  async newPage(): Promise<Page> {
    if (!this.context) await this.init();
    const page = await this.context!.newPage();
    await page.route('**/(analytics|tracking|metrics|ads|doubleclick)/**', r => r.abort());
    return page;
  }

  getContext(): BrowserContext {
    if (!this.context) throw new Error('Browser not initialized.');
    return this.context;
  }

  getMode(): string {
    return this.mode;
  }

  async saveSession(): Promise<void> {
    if (!this.context) return;
    const { mkdirSync } = await import('fs');
    const path = await import('path');
    mkdirSync(path.dirname(config.session.file), { recursive: true });
    await this.context.storageState({ path: config.session.file });
    log('Session saved to', config.session.file);
  }

  async close(): Promise<void> {
    if (this.mode !== 'cdp') {
      // Don't close CDP — it's the user's live Chrome
      await this.saveSession().catch(() => {});
      await this.browser?.close();
    }
    this.browser = null;
    this.context = null;
    this.mode = 'none';
  }

  isReady(): boolean {
    return this.context !== null;
  }
}

export const browserManager = new BrowserManager();
