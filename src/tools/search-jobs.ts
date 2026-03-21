import { z } from 'zod';
import { ensureLoggedIn } from '../browser/upwork-auth.js';
import { humanDelay } from '../browser/upwork-auth.js';

export const SearchJobsSchema = z.object({
  query: z
    .string()
    .describe('Search keywords, e.g. "n8n automation", "workflow integration"'),
  category: z
    .string()
    .optional()
    .describe('Job category filter, e.g. "Web Development", "Data Science"'),
  budget_min: z.coerce.number().optional().describe('Minimum budget in USD'),
  budget_max: z.coerce.number().optional().describe('Maximum budget in USD'),
  job_type: z
    .enum(['hourly', 'fixed', 'all'])
    .optional()
    .default('all')
    .describe('Contract type filter'),
  experience_level: z
    .enum(['entry', 'intermediate', 'expert', 'all'])
    .optional()
    .default('all')
    .describe('Required experience level'),
  posted_within_days: z
    .number()
    .optional()
    .default(7)
    .describe('Only show jobs posted within N days'),
  limit: z.coerce.number().optional().default(10).describe('Max number of results to return'),
});

export type SearchJobsInput = z.infer<typeof SearchJobsSchema>;

export interface JobSummary {
  id: string;
  title: string;
  url: string;
  budget: string;
  job_type: string;
  experience_level: string;
  posted_at: string;
  description_snippet: string;
  skills: string[];
  proposals_count: string;
  client_rating: string;
  client_location: string;
}

export async function searchJobs(input: SearchJobsInput): Promise<JobSummary[]> {
  const page = await ensureLoggedIn();

  try {
    // Build Upwork search URL
    const params = new URLSearchParams();
    params.set('q', input.query);
    params.set('sort', 'recency'); // Sort by newest

    if (input.job_type !== 'all') {
      params.set('job_type', input.job_type === 'hourly' ? 'hourly' : 'fixed');
    }
    if (input.experience_level !== 'all') {
      const levelMap: Record<string, string> = {
        entry: '1',
        intermediate: '2',
        expert: '3',
      };
      params.set('contractor_tier', levelMap[input.experience_level]);
    }
    if (input.budget_min) params.set('budget', input.budget_min.toString());
    if (input.posted_within_days && input.posted_within_days <= 7) {
      params.set('t', 'weeks');
    }

    const searchUrl = `https://www.upwork.com/nx/search/jobs/?${params.toString()}`;
    console.error('[searchJobs] Navigating to:', searchUrl);

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(2000, 3500);

    // Wait for job cards to load
    await page.waitForSelector('[data-test="job-tile-list"]', { timeout: 15000 }).catch(() => {
      console.error('[searchJobs] Job tile list not found, trying alternate selector');
    });

    await humanDelay(1000, 2000);

    // Extract job data
    const jobs = await page.evaluate((limit: number) => {
      const cards = document.querySelectorAll('[data-test="job-tile"]');
      const results: JobSummary[] = [];

      cards.forEach((card, i) => {
        if (i >= limit) return;

        const titleEl = card.querySelector('[data-test="job-tile-title"] a, h2 a, .job-title a');
        const title = titleEl?.textContent?.trim() ?? '';
        const href = titleEl?.getAttribute('href') ?? '';
        const url = href.startsWith('http') ? href : `https://www.upwork.com${href}`;

        // Extract job ID from URL
        const idMatch = href.match(/~([a-z0-9]+)/);
        const id = idMatch?.[1] ?? `job_${i}`;

        const descEl = card.querySelector('[data-test="job-description-text"], .job-description');
        const description_snippet = descEl?.textContent?.trim().slice(0, 200) ?? '';

        const budgetEl = card.querySelector('[data-test="budget"], .job-type-label');
        const budget = budgetEl?.textContent?.trim() ?? '';

        const postedEl = card.querySelector('[data-test="job-pubilshed-date"], time');
        const posted_at = postedEl?.textContent?.trim() ?? '';

        const skillEls = card.querySelectorAll('[data-test="token"], .skill-badge');
        const skills = Array.from(skillEls)
          .map((el) => el.textContent?.trim())
          .filter(Boolean) as string[];

        const proposalsEl = card.querySelector('[data-test="proposals-tier"]');
        const proposals_count = proposalsEl?.textContent?.trim() ?? '';

        const clientRatingEl = card.querySelector('[data-test="client-rating"] .rating');
        const client_rating = clientRatingEl?.textContent?.trim() ?? '';

        const clientLocationEl = card.querySelector('[data-test="client-location"] strong');
        const client_location = clientLocationEl?.textContent?.trim() ?? '';

        const experienceEl = card.querySelector('[data-test="contractor-tier"]');
        const experience_level = experienceEl?.textContent?.trim() ?? '';

        const jobTypeEl = card.querySelector('[data-test="job-type-label"]');
        const job_type = jobTypeEl?.textContent?.trim() ?? '';

        results.push({
          id,
          title,
          url,
          budget,
          job_type,
          experience_level,
          posted_at,
          description_snippet,
          skills,
          proposals_count,
          client_rating,
          client_location,
        });
      });

      return results;
    }, input.limit);

    console.error(`[searchJobs] Found ${jobs.length} jobs`);
    return jobs.filter((j) => j.title); // Filter out empty entries
  } finally {
    await page.close();
  }
}
