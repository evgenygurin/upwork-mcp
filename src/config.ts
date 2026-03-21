import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

export const config = {
  upwork: {
    email: required('UPWORK_EMAIL'),
    password: required('UPWORK_PASSWORD'),
    apiKey: optional('UPWORK_API_KEY'),
    apiSecret: optional('UPWORK_API_SECRET'),
    accessToken: optional('UPWORK_ACCESS_TOKEN'),
    accessSecret: optional('UPWORK_ACCESS_SECRET'),
    baseUrl: 'https://www.upwork.com',
    apiUrl: 'https://api.upwork.com',
  },
  browser: {
    headless: optional('BROWSER_HEADLESS', 'true') === 'true',
    slowMo: parseInt(optional('BROWSER_SLOW_MO', '50')),
    executablePath: optional('BROWSER_EXECUTABLE_PATH', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'),
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
    ],
  },
  session: {
    file: path.resolve(
      __dirname,
      '..',
      optional('SESSION_FILE', './sessions/upwork-session.json')
    ),
  },
  freelancer: {
    name: optional('FREELANCER_NAME', 'Freelancer'),
    title: optional('FREELANCER_TITLE', 'n8n Workflow Automation Expert'),
    niche: optional('FREELANCER_NICHE', 'n8n,workflow automation').split(','),
  },
  bid: {
    min: parseInt(optional('BID_RATE_MIN', '25')),
    max: parseInt(optional('BID_RATE_MAX', '75')),
    default: parseInt(optional('BID_RATE_DEFAULT', '40')),
  },
} as const;
