/**
 * Upwork REST API Client
 * Handles OAuth 1.0a calls for endpoints that are available via official API.
 * For actions not available via API (proposals, messaging), use browser tools.
 */
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { config } from '../config.js';

const log = (...args: unknown[]) => console.error('[UpworkAPI]', ...args);

interface OAuthParams {
  oauth_consumer_key: string;
  oauth_token: string;
  oauth_signature_method: string;
  oauth_timestamp: string;
  oauth_nonce: string;
  oauth_version: string;
  oauth_signature?: string;
}

class UpworkApiClient {
  private client: AxiosInstance;
  private hasCredentials: boolean;

  constructor() {
    this.hasCredentials = !!(
      config.upwork.apiKey &&
      config.upwork.apiSecret &&
      config.upwork.accessToken &&
      config.upwork.accessSecret
    );

    this.client = axios.create({
      baseURL: config.upwork.apiUrl,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private generateOAuthSignature(
    method: string,
    url: string,
    params: Record<string, string>
  ): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join('&');

    const baseString = [
      method.toUpperCase(),
      encodeURIComponent(url),
      encodeURIComponent(sortedParams),
    ].join('&');

    const signingKey = [
      encodeURIComponent(config.upwork.apiSecret),
      encodeURIComponent(config.upwork.accessSecret),
    ].join('&');

    return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
  }

  private buildAuthHeader(method: string, url: string, extraParams: Record<string, string> = {}): string {
    const oauthParams: OAuthParams = {
      oauth_consumer_key: config.upwork.apiKey,
      oauth_token: config.upwork.accessToken,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_version: '1.0',
    };

    const allParams = { ...oauthParams, ...extraParams };
    oauthParams.oauth_signature = this.generateOAuthSignature(method, url, allParams);

    const headerParts = Object.entries(oauthParams)
      .map(([k, v]) => `${k}="${encodeURIComponent(v!)}"`)
      .join(', ');

    return `OAuth ${headerParts}`;
  }

  async getMyProfile(): Promise<Record<string, unknown>> {
    if (!this.hasCredentials) throw new Error('Upwork API credentials not configured.');

    const url = `${config.upwork.apiUrl}/api/profiles/v1/me.json`;
    const authHeader = this.buildAuthHeader('GET', url);
    const res = await this.client.get('/api/profiles/v1/me.json', {
      headers: { Authorization: authHeader },
    });
    return res.data;
  }

  async getMyStats(): Promise<Record<string, unknown>> {
    if (!this.hasCredentials) throw new Error('Upwork API credentials not configured.');

    const url = `${config.upwork.apiUrl}/api/hr/v2/reports/provider/hours.json`;
    const authHeader = this.buildAuthHeader('GET', url);
    const res = await this.client.get('/api/hr/v2/reports/provider/hours.json', {
      headers: { Authorization: authHeader },
    });
    return res.data;
  }

  isConfigured(): boolean {
    return this.hasCredentials;
  }
}

export const upworkApi = new UpworkApiClient();
