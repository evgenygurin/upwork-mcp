import { z } from 'zod';
import { ensureLoggedIn, humanDelay } from '../browser/upwork-auth.js';

export const GetJobDetailsSchema = z.object({
  job_url: z.string().describe('Full URL of the Upwork job posting'),
});

export type GetJobDetailsInput = z.infer<typeof GetJobDetailsSchema>;

export interface JobDetails {
  id: string;
  title: string;
  url: string;
  description: string;
  budget: string;
  job_type: string;
  duration: string;
  experience_level: string;
  posted_at: string;
  skills: string[];
  category: string;
  subcategory: string;
  // Screening questions from client
  screening_questions: string[];
  // Client info
  client: {
    name: string;
    location: string;
    rating: string;
    reviews_count: string;
    jobs_posted: string;
    hire_rate: string;
    total_spent: string;
    member_since: string;
  };
  // Proposal stats
  proposals_count: string;
  interviewing_count: string;
  invites_sent: string;
  // Upwork's AI analysis context (if visible)
  connects_required: string;
}

export async function getJobDetails(input: GetJobDetailsInput): Promise<JobDetails> {
  const page = await ensureLoggedIn();

  try {
    console.error('[getJobDetails] Navigating to:', input.job_url);
    await page.goto(input.job_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(2000, 4000);

    // Wait for job content — title is h4 on Upwork job detail page
    await page.waitForSelector('h4, [data-test="Description"]', { timeout: 15000 });
    await humanDelay(1000, 2000);

    const details = await page.evaluate((): JobDetails => {
      const get = (sel: string) => document.querySelector(sel)?.textContent?.trim() ?? '';
      const getAll = (sel: string) => Array.from(document.querySelectorAll(sel)).map(el => el.textContent?.trim()).filter(Boolean) as string[];

      const url = window.location.href;
      const idMatch = url.match(/~([a-z0-9]+)/i);
      const id = idMatch?.[1] ?? '';

      // Title is in h4 on job detail page
      const title = get('h4') || get('h1') || get('[data-test="job-title"]');

      // Description
      const description = get('[data-test="Description"]') || get('.description') || '';

      // Parse job info list items (budget, duration, experience, etc.)
      const listItems = Array.from(document.querySelectorAll('li')).map(el => el.textContent?.replace(/\s+/g, ' ').trim()).filter(Boolean) as string[];
      const budget = listItems.find(t => /\$[\d,]+/.test(t) && (t.includes('/hr') || t.includes('Hourly') || t.includes('Fixed'))) ?? listItems.find(t => t.includes('Hourly') || t.includes('Fixed')) ?? '';
      const duration = listItems.find(t => t.includes('month') || t.includes('week') || t.includes('Duration')) ?? '';
      const experience_level = listItems.find(t => t.includes('Expert') || t.includes('Intermediate') || t.includes('Entry')) ?? '';
      const job_type = budget.includes('Hourly') ? 'Hourly' : budget.includes('Fixed') ? 'Fixed-price' : '';

      // Skills
      const skills = getAll('.up-skill-badge, [data-test="attr-item"], .skills-list .skill').length > 0
        ? getAll('.up-skill-badge, [data-test="attr-item"], .skills-list .skill')
        : getAll('[data-test="token"]');

      // Activity / proposals
      const proposals_count = listItems.find(t => t.includes('Proposals:') || t.includes('to ')) ?? '';
      const interviewing_count = listItems.find(t => t.startsWith('Interviewing:')) ?? '';
      const invites_sent = listItems.find(t => t.startsWith('Invites sent:')) ?? '';

      // Client info from about-client-container
      const clientContainer = document.querySelector('[data-test="about-client-container"]');
      const clientItems = clientContainer ? Array.from(clientContainer.querySelectorAll('li,p,div')).map(el => el.textContent?.replace(/\s+/g, ' ').trim()).filter(t => t && t.length > 2 && t.length < 100) : [];
      const location = clientItems.find(t => /[A-Z][a-z].*\d{1,2}:\d{2}/.test(t) || t.includes('Israel') || t.includes('United')) ?? '';
      const rating = clientItems.find(t => t.includes('5.0') || t.includes('4.') || t.includes('of 5')) ?? '';
      const total_spent = listItems.find(t => t.includes('total spent') || t.includes('K total') || t.includes('M total')) ?? '';
      const jobs_posted = listItems.find(t => t.includes('jobs posted')) ?? '';
      const hire_rate = listItems.find(t => t.includes('hire rate')) ?? '';
      const member_since = listItems.find(t => t.includes('Member since')) ?? '';

      // Screening questions
      const screening_questions = getAll('[data-test="additional-question"], .screening-question, [class*="question"] li');

      return {
        id, url, title, description, budget, job_type, duration, experience_level,
        posted_at: listItems.find(t => t.includes('ago') || t.includes('Posted')) ?? '',
        skills, category: '', subcategory: '', screening_questions,
        client: { name: '', location, rating, reviews_count: '', jobs_posted, hire_rate, total_spent, member_since },
        proposals_count, interviewing_count, invites_sent, connects_required: '',
      };
    });

    console.error('[getJobDetails] Job title:', details.title);
    return details;
  } finally {
    await page.close();
  }
}
