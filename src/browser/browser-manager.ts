import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { config } from '../config.js';

const log = (...args: unknown[]) => console.error('[BrowserManager]', ...args);
const CDP_PORT = parseInt(process.env.CDP_PORT ?? '9222');
const CDP_HOST = process.env.CDP_HOST ?? '127.0.0.1';
const CDP_URL = `http://${CDP_HOST}:${CDP_PORT}`;

class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private isCdpMode = false;

  /**
   * Try CDP first (existing Chrome). If unavailable, launch Playwright's Chromium directly.
   */
  async init(): Promise<void> {
    if (this.context) return;

    // Try CDP first
    try {
      log(`Trying CDP at ${CDP_URL}...`);
      this.browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 }) as unknown as Browser;
      const contexts = (this.browser as unknown as { contexts(): BrowserContext[] }).contexts();
      if (!contexts.length) throw new Error('No browser context found in Chrome');
      this.context = contexts[0];
      this.isCdpMode = true;
      log('Connected via CDP. Mode: live Chrome.');
      return;
    } catch {
      log(`CDP not available — launching Playwright Chromium in headless mode.`);
    }

    // Fallback: launch Playwright's Chromium directly
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-gpu',
        '--ignore-certificate-errors',
      ],
    });
    this.context = await this.browser.newContext({
      userAgent: config.browser.userAgent,
      viewport: config.browser.viewport,
      ignoreHTTPSErrors: true,
    });
    this.isCdpMode = false;
    log('Playwright Chromium launched. Mode: headless.');
  }

  async newPage(): Promise<Page> {
    if (!this.context) await this.init();
    const page = await this.context!.newPage();
    await page.route('**/(analytics|tracking|metrics|doubleclick)/**', r => r.abort()).catch(() => {});
    return page;
  }

  getContext(): BrowserContext {
    if (!this.context) throw new Error('Browser not initialized. Call init() first.');
    return this.context;
  }

  async close(): Promise<void> {
    if (!this.isCdpMode && this.browser) {
      await this.browser.close().catch(() => {});
    }
    this.browser = null;
    this.context = null;
  }

  isReady(): boolean {
    return this.context !== null;
  }
}

export const browserManager = new BrowserManager();
