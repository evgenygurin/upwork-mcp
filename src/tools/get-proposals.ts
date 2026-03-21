import { z } from 'zod';
import { ensureLoggedIn, humanDelay } from '../browser/upwork-auth.js';

export const GetProposalsSchema = z.object({
  status: z
    .enum(['active', 'archived', 'all'])
    .optional()
    .default('active')
    .describe('Filter proposals by status'),
  limit: z.number().optional().default(20).describe('Max proposals to return'),
});

export type GetProposalsInput = z.infer<typeof GetProposalsSchema>;

export interface ProposalItem {
  id: string;
  job_title: string;
  job_url: string;
  status: string;
  bid_rate: string;
  submitted_at: string;
  client_name: string;
  client_location: string;
  interviewing: boolean;
}

export async function getProposals(input: GetProposalsInput): Promise<ProposalItem[]> {
  const page = await ensureLoggedIn();

  try {
    const url =
      input.status === 'archived'
        ? 'https://www.upwork.com/nx/proposals/archived'
        : 'https://www.upwork.com/nx/proposals';

    console.error('[getProposals] Navigating to:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(2000, 4000);

    await page.waitForSelector('[data-test="proposal-list"], .proposals-list, article', {
      timeout: 15000,
    }).catch(() => console.error('[getProposals] Selector not found, extracting anyway'));

    await humanDelay(1000, 2000);

    const proposals = await page.evaluate((limit: number): ProposalItem[] => {
      const cards = document.querySelectorAll(
        '[data-test="proposal-list-item"], .proposal-item, article'
      );
      const results: ProposalItem[] = [];

      cards.forEach((card, i) => {
        if (i >= limit) return;

        const titleEl = card.querySelector('a[href*="/jobs/"], a[href*="~"]');
        const title = titleEl?.textContent?.trim() ?? '';
        const href = titleEl?.getAttribute('href') ?? '';
        const job_url = href.startsWith('http') ? href : `https://www.upwork.com${href}`;

        const idMatch = href.match(/~([a-z0-9]+)/);
        const id = idMatch?.[1] ?? `proposal_${i}`;

        results.push({
          id,
          job_title: title,
          job_url,
          status:
            card.querySelector('[data-test="status"], .status-badge')?.textContent?.trim() ?? '',
          bid_rate:
            card.querySelector('[data-test="bid-rate"], .bid-rate')?.textContent?.trim() ?? '',
          submitted_at:
            card.querySelector('time, [data-test="submitted-at"]')?.textContent?.trim() ?? '',
          client_name:
            card.querySelector('[data-test="client-name"]')?.textContent?.trim() ?? '',
          client_location:
            card.querySelector('[data-test="client-location"]')?.textContent?.trim() ?? '',
          interviewing: card.textContent?.toLowerCase().includes('interviewing') ?? false,
        });
      });

      return results;
    }, input.limit);

    console.error(`[getProposals] Found ${proposals.length} proposals`);
    return proposals.filter((p) => p.job_title);
  } finally {
    await page.close();
  }
}
