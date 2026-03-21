import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { config } from '../config.js';

// Log to stderr only — stdout is reserved for MCP protocol
const log = (...args: unknown[]) => console.error('[BrowserManager]', ...args);

class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async init(): Promise<void> {
    if (this.browser) return;

    log('Launching Chrome...');
    this.browser = await chromium.launch({
      headless: config.browser.headless,
      slowMo: config.browser.slowMo,
      executablePath: config.browser.executablePath || undefined,
      args: [...config.browser.args],
    });

    this.context = await this.browser.newContext({
      userAgent: config.browser.userAgent,
      viewport: config.browser.viewport,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    await this._applyStealthPatches();
    log('Browser ready.');
  }

  private async _applyStealthPatches(): Promise<void> {
    await this.context!.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
    });
  }

  async newPage(): Promise<Page> {
    if (!this.context) await this.init();
    const page = await this.context!.newPage();

    // Block analytics/tracking to speed up and reduce fingerprint
    await page.route('**/(analytics|tracking|metrics|ads|doubleclick)/**', (route) =>
      route.abort()
    );

    return page;
  }

  getContext(): BrowserContext {
    if (!this.context) throw new Error('Browser not initialized. Call init() first.');
    return this.context;
  }

  async saveSession(): Promise<void> {
    if (!this.context) return;
    const { mkdirSync } = await import('fs');
    const path = await import('path');
    mkdirSync(path.dirname(config.session.file), { recursive: true });
    await this.context.storageState({ path: config.session.file });
    log('Session saved to', config.session.file);
  }

  async loadSession(): Promise<boolean> {
    const { existsSync } = await import('fs');
    if (!existsSync(config.session.file)) return false;

    const browser = await chromium.launch({
      headless: config.browser.headless,
      slowMo: config.browser.slowMo,
      executablePath: config.browser.executablePath || undefined,
      args: [...config.browser.args],
    });

    this.browser = browser;
    this.context = await browser.newContext({
      userAgent: config.browser.userAgent,
      viewport: config.browser.viewport,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      storageState: config.session.file,
    });

    await this._applyStealthPatches();
    log('Session loaded from', config.session.file);
    return true;
  }

  async close(): Promise<void> {
    await this.saveSession();
    await this.browser?.close();
    await this.context?.close();
    this.browser = null;
    this.context = null;
    log('Browser closed.');
  }

  isReady(): boolean {
    return this.context !== null;
  }
}

// Singleton
export const browserManager = new BrowserManager();
