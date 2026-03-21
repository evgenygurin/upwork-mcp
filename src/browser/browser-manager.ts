import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { config } from '../config.js';

const log = (...args: unknown[]) => console.error('[BrowserManager]', ...args);
const CDP_PORT = parseInt(process.env.CDP_PORT ?? '9222');
const CDP_HOST = process.env.CDP_HOST ?? '127.0.0.1';
const CDP_URL = `http://${CDP_HOST}:${CDP_PORT}`;

class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  /**
   * Connect to the existing Chrome via CDP.
   * Chrome must be running with --remote-debugging-port=9222
   * Run connect-chrome.bat to start it.
   */
  async init(): Promise<void> {
    if (this.context) return;

    log(`Connecting to Chrome via CDP at ${CDP_URL}...`);
    try {
      this.browser = await chromium.connectOverCDP(CDP_URL, { timeout: 5000 }) as unknown as Browser;
      const contexts = (this.browser as unknown as { contexts(): BrowserContext[] }).contexts();
      if (!contexts.length) throw new Error('No browser context found in Chrome');
      this.context = contexts[0];
      log('Connected via CDP. Mode: live Chrome.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Cannot connect to Chrome CDP at ${CDP_URL}.\n` +
        `Run connect-chrome.bat to start Chrome with --remote-debugging-port=${CDP_PORT}.\n` +
        `Original error: ${msg}`
      );
    }
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
    // Don't close CDP — it's the user's live Chrome
    this.browser = null;
    this.context = null;
  }

  isReady(): boolean {
    return this.context !== null;
  }
}

export const browserManager = new BrowserManager();
