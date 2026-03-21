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
  max_pages: z.coerce.number().optional().default(1).describe('Number of pages to scrape (10 jobs/page). Default: 1, max: 5'),
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
  const maxPages = Math.min(input.max_pages ?? 1, 5);
  const allJobs: JobSummary[] = [];
  const seenIds = new Set<string>();

  try {
    const params = new URLSearchParams();
    params.set('q', input.query);
    params.set('sort', 'recency');
    if (input.job_type !== 'all') params.set('job_type', input.job_type === 'hourly' ? 'hourly' : 'fixed');
    if (input.experience_level !== 'all') {
      params.set('contractor_tier', ({ entry: '1', intermediate: '2', expert: '3' })[input.experience_level] ?? '');
    }
    if (input.budget_min) params.set('budget', input.budget_min.toString());
    if (input.posted_within_days && input.posted_within_days <= 7) params.set('t', 'weeks');

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      if (allJobs.length >= input.limit) break;

      params.set('page', pageNum.toString());
      const searchUrl = `https://www.upwork.com/nx/search/jobs/?${params.toString()}`;
      console.error(`[searchJobs] Page ${pageNum}/${maxPages}: ${searchUrl}`);

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await humanDelay(2000, 3000);

      await page.waitForSelector('article[data-test="JobTile"]', { timeout: 15000 }).catch(() => {
        console.error(`[searchJobs] No job tiles on page ${pageNum}`);
      });
      await humanDelay(800, 1500);

      const rawJobs = await page.evaluate(() => {
        const cards = document.querySelectorAll('article[data-test="JobTile"]');
        return Array.from(cards).map(card => {
          const titleEl = card.querySelector('[data-test="job-tile-title-link UpLink"], h2 a');
          const title = titleEl?.textContent?.trim() ?? '';
          const href = titleEl?.getAttribute('href') ?? '';
          const url = href.startsWith('http') ? href : `https://www.upwork.com${href}`;
          const idMatch = href.match(/~([a-z0-9]+)/i);
          const id = idMatch?.[1] ?? '';
          return {
            id, title, url,
            budget: (card.querySelector('[data-test="budget"], [data-test="duration-label"]') as HTMLElement)?.innerText?.trim() ?? (card.querySelector('[data-test="job-type-label"]') as HTMLElement)?.innerText?.trim() ?? '',
            job_type: (card.querySelector('[data-test="job-type-label"]') as HTMLElement)?.innerText?.trim() ?? '',
            experience_level: (card.querySelector('[data-test="experience-level"]') as HTMLElement)?.innerText?.trim() ?? '',
            posted_at: (card.querySelector('[data-test="job-pubilshed-date"]') as HTMLElement)?.innerText?.trim() ?? '',
            description_snippet: ((card.querySelector('[data-test="UpCLineClamp JobDescription"]') as HTMLElement)?.innerText?.trim() ?? '').slice(0, 250),
            skills: Array.from(card.querySelectorAll('[data-test="token"]')).map(el => el.textContent?.trim()).filter(Boolean) as string[],
            proposals_count: (card.querySelector('[data-test="proposals-tier"]') as HTMLElement)?.innerText?.trim() ?? '',
            client_rating: ((card.querySelector('[data-test="total-feedback"]') as HTMLElement)?.innerText?.trim() ?? '').slice(0, 20),
            client_location: ((card.querySelector('[data-test="location"]') as HTMLElement)?.innerText?.replace('Location', '').trim() ?? ''),
          };
        });
      });

      for (const job of rawJobs) {
        if (!job.title || !job.id || seenIds.has(job.id)) continue;
        seenIds.add(job.id);
        allJobs.push(job as JobSummary);
        if (allJobs.length >= input.limit) break;
      }

      console.error(`[searchJobs] Page ${pageNum}: +${rawJobs.length} jobs. Total: ${allJobs.length}`);

      // If fewer than 10 results, no more pages
      if (rawJobs.length < 10) break;
    }

    return allJobs;
  } finally {
    await page.close();
  }
}
