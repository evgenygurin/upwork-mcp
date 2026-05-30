import { chromium as playwrightChromium, Browser, BrowserContext, Page } from 'playwright';
import { chromium as extraChromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

extraChromium.use(StealthPlugin());

const log = (...args: unknown[]) => console.error('[BrowserManager]', ...args);
const CDP_PORT = parseInt(process.env.CDP_PORT ?? '9222');
const CDP_HOST = process.env.CDP_HOST ?? '127.0.0.1';
const CDP_URL = `http://${CDP_HOST}:${CDP_PORT}`;

class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private launchMode: 'cdp' | 'headless' = 'cdp';

  private async launchHeadless(): Promise<void> {
    const sessionFile = config.session.file;
    const hasSession = fs.existsSync(sessionFile);
    if (hasSession) {
      log('Loading session from', sessionFile);
    }

    const useHeadless = !process.env.DISPLAY;
    log(`Launching browser in ${useHeadless ? 'headless' : 'non-headless (virtual display)'} mode`);
    this.browser = await (extraChromium.launch as typeof playwrightChromium.launch)({
      headless: useHeadless,
      slowMo: config.browser.slowMo,
      args: [
        ...config.browser.args,
        '--disable-gpu',
        '--ignore-certificate-errors',
        '--ignore-ssl-errors',
        '--allow-insecure-localhost',
        ...(useHeadless ? [] : ['--no-first-run', '--no-default-browser-check']),
      ],
    });

    this.context = await this.browser.newContext({
      userAgent: config.browser.userAgent,
      viewport: config.browser.viewport,
      ignoreHTTPSErrors: true,
      ...(hasSession ? { storageState: sessionFile } : {}),
    });

    this.launchMode = 'headless';
    log('Launched Playwright Chromium in headless mode.');
  }

  /**
   * Try CDP first; fall back to launching Playwright Chromium headlessly.
   */
  async init(): Promise<void> {
    if (this.context) return;

    log(`Trying Chrome CDP at ${CDP_URL}...`);
    try {
      this.browser = await playwrightChromium.connectOverCDP(CDP_URL, { timeout: 3000 }) as unknown as Browser;
      const contexts = (this.browser as unknown as { contexts(): BrowserContext[] }).contexts();
      if (!contexts.length) throw new Error('No browser context found in Chrome');
      this.context = contexts[0];
      this.launchMode = 'cdp';
      log('Connected via CDP. Mode: live Chrome.');
    } catch {
      log('CDP not available — launching Playwright Chromium headlessly.');
      await this.launchHeadless();
    }
  }

  isHeadlessMode(): boolean {
    return this.launchMode === 'headless';
  }

  async saveSession(): Promise<void> {
    if (!this.context) return;
    fs.mkdirSync(path.dirname(config.session.file), { recursive: true });
    await this.context.storageState({ path: config.session.file });
    log('Session saved to', config.session.file);
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
    if (this.launchMode === 'headless' && this.browser) {
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
