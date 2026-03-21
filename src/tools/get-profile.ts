import { z } from 'zod';
import { ensureLoggedIn, humanDelay } from '../browser/upwork-auth.js';

export const GetProfileSchema = z.object({
  include_stats: z
    .coerce.boolean()
    .optional()
    .default(true)
    .describe('Include earnings stats, connects balance, JSS score'),
});

export type GetProfileInput = z.infer<typeof GetProfileSchema>;

export interface FreelancerProfile {
  name: string;
  title: string;
  description: string;
  hourly_rate: string;
  availability: string;
  skills: string[];
  location: string;
  // Stats
  jss_score: string;
  top_rated: boolean;
  total_earnings: string;
  total_jobs: string;
  total_hours: string;
  connects_balance: string;
  // Ratings
  rating: string;
  reviews_count: string;
  // Profile completeness
  profile_url: string;
}

export async function getProfile(input: GetProfileInput): Promise<FreelancerProfile> {
  const page = await ensureLoggedIn();

  try {
    console.error('[getProfile] Loading profile page...');
    await page.goto('https://www.upwork.com/freelancers/settings/profile', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await humanDelay(2000, 3500);

    // Also fetch stats from the main account page
    let connects_balance = '';
    let jss_score = '';
    let top_rated = false;
    let total_earnings = '';

    if (input.include_stats) {
      await page.goto('https://www.upwork.com/nx/find-work/best-matches', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await humanDelay(1500, 3000);

      const statsData = await page.evaluate(() => {
        return {
          connects:
            document.querySelector('[data-test="connects-balance"], .connects-balance')
              ?.textContent?.trim() ?? '',
          jss: document.querySelector('[data-test="jss-score"], .jss-score')?.textContent?.trim() ?? '',
          top_rated:
            document.querySelector('[data-test="top-rated-badge"], .top-rated-badge') !== null,
        };
      });

      connects_balance = statsData.connects;
      jss_score = statsData.jss;
      top_rated = statsData.top_rated;

      // Navigate to earnings
      await page.goto('https://www.upwork.com/nx/payments/reports', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await humanDelay(1500, 2500);

      total_earnings = await page
        .locator('[data-test="total-earnings"], .total-earnings')
        .first()
        .textContent()
        .catch(() => '')
        .then((t) => t?.trim() ?? '');
    }

    // Navigate to public profile
    await page.goto('https://www.upwork.com/freelancers/~me', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await humanDelay(2000, 3500);

    const profile = await page.evaluate((): Omit<FreelancerProfile, 'connects_balance' | 'jss_score' | 'top_rated' | 'total_earnings'> => {
      const get = (sel: string) =>
        document.querySelector(sel)?.textContent?.trim() ?? '';
      const getAll = (sel: string) =>
        Array.from(document.querySelectorAll(sel))
          .map((el) => el.textContent?.trim())
          .filter(Boolean) as string[];

      return {
        name: get('[data-test="freelancer-name"], h1, .freelancer-name'),
        title: get('[data-test="freelancer-title"], .title, h2'),
        description:
          get('[data-test="description"] p, .description p') ||
          get('[data-test="description"], .description'),
        hourly_rate: get('[data-test="hourly-rate"], .hourly-rate, .rate'),
        availability: get('[data-test="availability"], .availability'),
        skills: getAll('[data-test="skill"] span, .skill-badge, .air3-token'),
        location: get('[data-test="location"], .location'),
        rating: get('[data-test="rating"] .rating-value, .rating'),
        reviews_count: get('[data-test="reviews-count"], .reviews-count'),
        total_jobs: get('[data-test="total-jobs"], .total-jobs'),
        total_hours: get('[data-test="total-hours"], .total-hours'),
        profile_url: window.location.href,
      };
    });

    return {
      ...profile,
      connects_balance,
      jss_score,
      top_rated,
      total_earnings,
    };
  } finally {
    await page.close();
  }
}
