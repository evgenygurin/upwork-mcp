import { config } from '../config.js';
import path from 'path';
import fs from 'fs';

const CDP_PORT = parseInt(process.env.CDP_PORT ?? '9222');
const log = (...args: unknown[]) => console.error('[ManualLogin]', ...args);

/** Fetch JSON from Chrome CDP endpoint */
async function cdpFetch(path: string): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}${path}`);
  if (!res.ok) throw new Error(`CDP HTTP ${res.status}: ${path}`);
  return res.json();
}

/** Send a CDP command to a specific target */
async function cdpCommand(wsUrl: string, method: string, params = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Use dynamic import for ws
    import('ws').then(({ default: WebSocket }) => {
      const ws = new WebSocket(wsUrl);
      const id = 1;
      ws.once('open', () => {
        ws.send(JSON.stringify({ id, method, params }));
      });
      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id === id) {
            ws.close();
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
          }
        } catch { /* ignore parse errors */ }
      });
      ws.on('error', reject);
      setTimeout(() => { ws.close(); reject(new Error('CDP command timeout')); }, 10000);
    }).catch(reject);
  });
}

/**
 * Connects to existing Chrome via CDP (no Playwright needed),
 * extracts cookies from the Upwork tab, and saves session file.
 */
export async function manualLogin(): Promise<{ success: boolean; message: string }> {
  try {
    log('Checking CDP at localhost:', CDP_PORT);

    // Get list of tabs
    const targets = await cdpFetch('/json') as Array<{
      type: string; url: string; webSocketDebuggerUrl: string; title: string;
    }>;

    const upworkTarget = targets.find(t =>
      t.type === 'page' && t.url.includes('upwork.com')
    );

    if (!upworkTarget) {
      const allUrls = targets.filter(t => t.type === 'page').map(t => t.url);
      return {
        success: false,
        message: `Chrome is connected but no Upwork tab found.\nOpen tabs: ${allUrls.join(', ')}\nPlease navigate to upwork.com first.`,
      };
    }

    log('Found Upwork tab:', upworkTarget.url);

    // Check if logged in
    if (upworkTarget.url.includes('/login') || upworkTarget.url.includes('account-security')) {
      return {
        success: false,
        message: `Upwork tab found but not logged in. URL: ${upworkTarget.url}\nPlease login to Upwork first, then call manual_login again.`,
      };
    }

    // Get all cookies for upwork.com
    const cookieResult = await cdpCommand(
      upworkTarget.webSocketDebuggerUrl,
      'Network.getAllCookies'
    ) as { cookies: Array<{
      name: string; value: string; domain: string; path: string;
      expires: number; httpOnly: boolean; secure: boolean; sameSite?: string;
    }> };

    const upworkCookies = cookieResult.cookies.filter(c =>
      c.domain.includes('upwork.com')
    );

    log(`Found ${upworkCookies.length} Upwork cookies`);

    // Build Playwright-compatible storageState format
    const storageState = {
      cookies: upworkCookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: (c.sameSite as 'Strict' | 'Lax' | 'None') ?? 'None',
      })),
      origins: [] as unknown[],
    };

    // Save session file
    const sessionDir = path.dirname(config.session.file);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(config.session.file, JSON.stringify(storageState, null, 2));

    log('Session saved to', config.session.file);

    return {
      success: true,
      message: `Session saved! Extracted ${upworkCookies.length} cookies from: ${upworkTarget.url}\nAll tools are now ready. Session file: ${config.session.file}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch') || msg.includes('connect')) {
      return {
        success: false,
        message:
          'Cannot connect to Chrome CDP. Chrome is not running with --remote-debugging-port=9222.\n' +
          'Fix: Run "connect-chrome.bat" in the upwork-mcp folder, then call manual_login again.',
      };
    }
    return { success: false, message: `Error: ${msg}` };
  }
}

export { manualLogin as saveSession };
