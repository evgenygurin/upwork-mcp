import { z } from 'zod';
import { ensureLoggedIn, humanDelay } from '../browser/upwork-auth.js';

export const GetProfileSchema = z.object({
  include_stats: z.coerce.boolean().optional().default(true),
});
export type GetProfileInput = z.infer<typeof GetProfileSchema>;

export interface FreelancerProfile {
  name: string; title: string; description: string;
  hourly_rate: string; availability: string; skills: string[];
  location: string; jss_score: string; top_rated: boolean;
  total_earnings: string; total_jobs: string; total_hours: string;
  connects_balance: string; rating: string; reviews_count: string;
  profile_url: string;
}

/** Discover the freelancer's own profile URL from the settings page */
async function getProfileUrl(page: import('playwright').Page): Promise<string> {
  await page.goto('https://www.upwork.com/freelancers/settings/profile', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await humanDelay(2000, 3000);
  const href = await page.evaluate(() => {
    const a = document.querySelector('a[href*="/freelancers/~"]');
    return a?.getAttribute('href') ?? '';
  });
  if (!href) throw new Error('Could not find profile URL from settings page.');
  return href.startsWith('http') ? href : `https://www.upwork.com${href}`;
}

export async function getProfile(input: GetProfileInput): Promise<FreelancerProfile> {
  const page = await ensureLoggedIn();

  try {
    const profileUrl = await getProfileUrl(page);
    console.error('[getProfile] Profile URL:', profileUrl);

    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(3000, 4000);

    const profile = await page.evaluate(() => {
      const text = (sel: string) => document.querySelector(sel)?.textContent?.trim() ?? '';
      const texts = (sel: string) => Array.from(document.querySelectorAll(sel))
        .map(e => e.textContent?.trim()).filter(Boolean) as string[];

      // Based on actual DOM inspection
      const name = text('h2.d-inline') || text('h2[class*="d-inline"]') || text('h2');
      const title = text('h3.mb-0') || text('h3[class*="mb-0"]');
      const hourly_rate = text('h3.my-6x') || text('h3[class*="my-6"]');

      // Description — usually in a section with data-v-test or specific class
      const descEl =
        document.querySelector('[data-test="overview"] p') ??
        document.querySelector('[class*="overview"] p') ??
        document.querySelector('[class*="description"] p') ??
        Array.from(document.querySelectorAll('p')).find(p => (p.textContent?.length ?? 0) > 100) ??
        null;
      const description = descEl?.textContent?.trim() ?? '';

      // Skills — air3-token spans
      const skills = texts('.air3-token span, .air3-token');

      // Location — often next to the name area
      const location = text('[class*="location"]') || text('[itemprop="address"]');

      // Availability
      const availability = text('[data-test="popover-hover-trigger"]') || '';

      // Connects
      const connectsEl = document.querySelector('[data-test="sidebar-connects-card"] h3');
      const connects_balance = connectsEl?.textContent?.match(/\d+/)?.[0] ?? '';

      // Stats
      const total_jobs = text('[data-test="total-jobs"]') || text('[class*="totalJobs"]');
      const total_hours = text('[data-test="total-hours"]') || text('[class*="totalHours"]');
      const rating = text('[class*="rating-value"]') || text('[class*="score"]');
      const reviews_count = text('[class*="feedbackCount"]') || text('[class*="reviews-count"]');

      return {
        name, title, description, hourly_rate, availability, skills,
        location, connects_balance, total_jobs, total_hours, rating, reviews_count,
        profile_url: window.location.href,
      };
    });

    return {
      ...profile,
      profile_url: profileUrl,
      jss_score: '',
      top_rated: false,
      total_earnings: '',
    };
  } finally {
    await page.close();
  }
}
