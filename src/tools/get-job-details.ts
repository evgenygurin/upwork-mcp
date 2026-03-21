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

    // Wait for job content
    await page.waitForSelector('h1, [data-test="job-title"]', { timeout: 15000 });
    await humanDelay(1000, 2000);

    const details = await page.evaluate((): JobDetails => {
      const get = (sel: string) =>
        document.querySelector(sel)?.textContent?.trim() ?? '';
      const getAll = (sel: string) =>
        Array.from(document.querySelectorAll(sel))
          .map((el) => el.textContent?.trim())
          .filter(Boolean) as string[];
      const getAttr = (sel: string, attr: string) =>
        document.querySelector(sel)?.getAttribute(attr) ?? '';

      const url = window.location.href;
      const idMatch = url.match(/~([a-z0-9]+)/);
      const id = idMatch?.[1] ?? '';

      // Screening questions
      const questionEls = document.querySelectorAll(
        '[data-test="additional-question"], .air3-card-section .questions li, [data-cy="qa-question"]'
      );
      const screening_questions = Array.from(questionEls)
        .map((el) => el.textContent?.trim())
        .filter(Boolean) as string[];

      return {
        id,
        url,
        title:
          get('[data-test="job-title"]') ||
          get('h1') ||
          get('.job-title'),
        description:
          get('[data-test="job-description"] .air3-line-clamp') ||
          get('[data-test="description"]') ||
          get('.job-description') ||
          get('section[data-cy="description"] p'),
        budget:
          get('[data-test="budget"]') ||
          get('.budget') ||
          get('[data-cy="budget"]'),
        job_type:
          get('[data-test="engagement-type"], [data-cy="job-type"]') ||
          get('.job-type'),
        duration:
          get('[data-test="duration"], [data-cy="duration"]') ||
          get('.duration'),
        experience_level:
          get('[data-test="contractor-tier"], [data-cy="experience-level"]') ||
          get('.experience-level'),
        posted_at:
          get('[data-test="posted-on"], time[datetime]') ||
          getAttr('time', 'datetime'),
        skills:
          getAll('[data-test="token"], .skill-badge, [data-cy="skill"]').length > 0
            ? getAll('[data-test="token"], .skill-badge, [data-cy="skill"]')
            : getAll('.air3-token'),
        category: get('[data-test="category"], [data-cy="category"]'),
        subcategory: get('[data-test="subcategory"], [data-cy="subcategory"]'),
        screening_questions,
        client: {
          name: get('[data-test="client-name"], [data-cy="client-name"]'),
          location:
            get('[data-test="client-location"] strong') ||
            get('[data-cy="client-location"]'),
          rating:
            get('[data-test="client-rating"] .rating') ||
            get('[data-cy="client-rating"]'),
          reviews_count: get('[data-test="reviews-count"]') || '',
          jobs_posted:
            get('[data-test="jobs-posted"]') ||
            get('[data-cy="jobs-posted"]'),
          hire_rate:
            get('[data-test="hire-rate"]') ||
            get('[data-cy="hire-rate"]'),
          total_spent:
            get('[data-test="total-spent"]') ||
            get('[data-cy="total-spent"]'),
          member_since:
            get('[data-test="member-since"]') ||
            get('[data-cy="member-since"]'),
        },
        proposals_count:
          get('[data-test="proposals-tier"]') ||
          get('[data-cy="proposals"]'),
        interviewing_count: get('[data-test="interviewing"]') || '',
        invites_sent: get('[data-test="invites-sent"]') || '',
        connects_required: get('[data-test="connects-to-apply"]') || '',
      };
    });

    console.error('[getJobDetails] Job title:', details.title);
    return details;
  } finally {
    await page.close();
  }
}
