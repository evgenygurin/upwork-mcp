import { chromium } from 'playwright';
import { chromium as chromiumExtra } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, BrowserContext, BrowserContextOptions, Page } from 'playwright';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

chromiumExtra.use(StealthPlugin());

const log = (...args: unknown[]) => console.error('[BrowserManager]', ...args);
const CDP_PORT = parseInt(process.env.CDP_PORT ?? '9222');
const CDP_HOST = process.env.CDP_HOST ?? '127.0.0.1';
const CDP_URL = `http://${CDP_HOST}:${CDP_PORT}`;

class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private proxyMode = false;

  async init(): Promise<void> {
    if (this.context) return;
    if (config.proxy.url) {
      await this.initProxy();
    } else {
      await this.initCDP();
    }
  }

  private async initProxy(): Promise<void> {
    log(`Proxy mode: ${config.proxy.url}`);

    // Parse proxy URL to separate credentials from server address
    let proxyServer: string;
    let username: string | undefined;
    let password: string | undefined;

    try {
      const u = new URL(config.proxy.url);
      username = u.username || undefined;
      password = u.password || undefined;
      u.username = '';
      u.password = '';
      proxyServer = u.toString().replace(/\/$/, '');
    } catch {
      proxyServer = config.proxy.url;
    }

    const browser = await chromiumExtra.launch({
      headless: config.browser.headless,
      args: [...config.browser.args],
      proxy: {
        server: proxyServer,
        username,
        password,
        bypass: config.proxy.bypass || undefined,
      },
    }) as unknown as Browser;

    const ctxOptions: BrowserContextOptions = {
      userAgent: config.browser.userAgent,
      viewport: config.browser.viewport,
      ignoreHTTPSErrors: true,
    };

    if (fs.existsSync(config.session.file)) {
      log('Loading saved session from', config.session.file);
      ctxOptions.storageState = config.session.file;
    }

    this.browser = browser;
    this.context = await browser.newContext(ctxOptions);
    this.proxyMode = true;
    log('Browser ready. Mode: proxy + stealth.');
  }

  private async initCDP(): Promise<void> {
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

  // Persists cookies + localStorage to the session file (proxy mode only).
  async saveSession(): Promise<void> {
    if (!this.context || !this.proxyMode) return;
    const dir = path.dirname(config.session.file);
    fs.mkdirSync(dir, { recursive: true });
    await this.context.storageState({ path: config.session.file });
    log('Session saved to', config.session.file);
  }

  async close(): Promise<void> {
    if (this.proxyMode) {
      await this.saveSession().catch(() => {});
      await this.context?.close().catch(() => {});
      await this.browser?.close().catch(() => {});
    }
    // In CDP mode, don't close — it's the user's live Chrome
    this.browser = null;
    this.context = null;
    this.proxyMode = false;
  }

  isReady(): boolean {
    return this.context !== null;
  }

  isProxyMode(): boolean {
    return this.proxyMode;
  }
}

export const browserManager = new BrowserManager();
