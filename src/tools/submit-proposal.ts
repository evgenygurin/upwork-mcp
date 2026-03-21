import { z } from 'zod';
import { ensureLoggedIn, humanDelay } from '../browser/upwork-auth.js';
import { config } from '../config.js';

export const SubmitProposalSchema = z.object({
  job_url: z.string().describe('Full URL of the Upwork job posting'),
  cover_letter: z
    .string()
    .describe(
      'The proposal/cover letter text. Should be personalized, mention the client\'s specific needs, and demonstrate n8n expertise.'
    ),
  bid_rate: z
    .number()
    .optional()
    .describe(
      `Hourly rate or fixed price bid in USD. Defaults to ${config.bid.default}. Range: ${config.bid.min}–${config.bid.max}.`
    ),
  estimated_duration: z
    .string()
    .optional()
    .describe('Estimated time to complete (for fixed-price jobs), e.g. "1 week", "3 days"'),
  screening_answers: z
    .array(z.string())
    .optional()
    .default([])
    .describe(
      'Answers to screening questions in order. Get questions first via get_job_details.'
    ),
  boost_bid: z
    .coerce.boolean()
    .optional()
    .default(false)
    .describe('Whether to use extra Connects to boost the proposal visibility'),
});

export type SubmitProposalInput = z.infer<typeof SubmitProposalSchema>;

export interface ProposalResult {
  success: boolean;
  message: string;
  proposal_url?: string;
}

export async function submitProposal(input: SubmitProposalInput): Promise<ProposalResult> {
  const page = await ensureLoggedIn();
  const bidRate = input.bid_rate ?? config.bid.default;

  try {
    console.error('[submitProposal] Navigating to job:', input.job_url);
    await page.goto(input.job_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(2000, 4000);

    // Find and click "Apply Now" button
    const applySelectors = [
      '[data-test="apply-button"]',
      '[data-cy="apply-button"]',
      'a[href*="/proposals/new"]',
      'button:has-text("Apply Now")',
      'a:has-text("Apply Now")',
    ];

    let clicked = false;
    for (const sel of applySelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btn.click();
        clicked = true;
        console.error('[submitProposal] Clicked apply button:', sel);
        break;
      }
    }

    if (!clicked) {
      return { success: false, message: 'Could not find Apply Now button. Job may be closed or already applied.' };
    }

    await humanDelay(2000, 4000);
    await page.waitForURL('**/proposals/**', { timeout: 15000 }).catch(() => {
      console.error('[submitProposal] URL did not change to /proposals/, continuing anyway');
    });

    // ─── Set bid rate ────────────────────────────────────────────────────────
    const hourlyRateInput = page.locator(
      '[data-test="rate-input"] input, input[name="rate"], #rate-input, input[placeholder*="rate"], input[placeholder*="Rate"]'
    ).first();

    if (await hourlyRateInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await hourlyRateInput.click({ clickCount: 3 });
      await hourlyRateInput.fill(bidRate.toString());
      console.error('[submitProposal] Set bid rate:', bidRate);
      await humanDelay(500, 1000);
    }

    // For fixed-price jobs — milestone / total price
    const fixedPriceInput = page.locator(
      'input[name="bid_amount"], input[placeholder*="Total price"], [data-test="bid-price"] input'
    ).first();

    if (await fixedPriceInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fixedPriceInput.click({ clickCount: 3 });
      await fixedPriceInput.fill(bidRate.toString());
      console.error('[submitProposal] Set fixed price:', bidRate);
      await humanDelay(500, 1000);
    }

    // ─── Fill cover letter ───────────────────────────────────────────────────
    const coverLetterSelectors = [
      'textarea[name="cover_letter"]',
      '[data-test="cover-letter"] textarea',
      '[data-cy="cover-letter"] textarea',
      'textarea[placeholder*="cover"]',
      '.cover-letter textarea',
      '#cover_letter',
    ];

    let coverLetterFilled = false;
    for (const sel of coverLetterSelectors) {
      const textarea = page.locator(sel).first();
      if (await textarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        await textarea.click();
        await textarea.fill('');
        // Type human-like
        await page.keyboard.type(input.cover_letter, { delay: Math.random() * 20 + 10 });
        coverLetterFilled = true;
        console.error('[submitProposal] Cover letter filled.');
        break;
      }
    }

    if (!coverLetterFilled) {
      console.error('[submitProposal] WARNING: Could not find cover letter textarea');
    }

    await humanDelay(1000, 2000);

    // ─── Answer screening questions ──────────────────────────────────────────
    if (input.screening_answers && input.screening_answers.length > 0) {
      const questionTextareas = await page.locator(
        '[data-test="additional-question"] textarea, [data-cy="qa-answer"] textarea, .screening-question textarea'
      ).all();

      for (let i = 0; i < Math.min(questionTextareas.length, input.screening_answers.length); i++) {
        const answer = input.screening_answers[i];
        if (answer) {
          await questionTextareas[i].click();
          await questionTextareas[i].fill('');
          await page.keyboard.type(answer, { delay: Math.random() * 20 + 10 });
          await humanDelay(500, 1000);
          console.error(`[submitProposal] Answered question ${i + 1}`);
        }
      }
    }

    await humanDelay(1500, 3000);

    // ─── Submit ──────────────────────────────────────────────────────────────
    const submitSelectors = [
      '[data-test="submit-proposal"]',
      '[data-cy="submit-proposal"]',
      'button[type="submit"]:has-text("Submit")',
      'button:has-text("Submit Proposal")',
      'button:has-text("Send Proposal")',
    ];

    let submitted = false;
    for (const sel of submitSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.error('[submitProposal] Clicking submit:', sel);
        await btn.click();
        submitted = true;
        break;
      }
    }

    if (!submitted) {
      return { success: false, message: 'Could not find Submit button. Proposal NOT submitted.' };
    }

    await humanDelay(3000, 5000);

    // Check for success
    const currentUrl = page.url();
    const successIndicators = [
      '[data-test="proposal-submitted"]',
      '[data-cy="proposal-submitted"]',
      '.proposal-submitted',
      ':has-text("Proposal Submitted")',
    ];

    for (const sel of successIndicators) {
      if (await page.locator(sel).isVisible({ timeout: 5000 }).catch(() => false)) {
        return {
          success: true,
          message: 'Proposal submitted successfully!',
          proposal_url: currentUrl,
        };
      }
    }

    // If URL changed to proposals list, likely succeeded
    if (currentUrl.includes('/proposals') && !currentUrl.includes('/new')) {
      return {
        success: true,
        message: 'Proposal submitted (redirected to proposals page).',
        proposal_url: currentUrl,
      };
    }

    return {
      success: true,
      message: 'Proposal likely submitted. Please verify manually.',
      proposal_url: currentUrl,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[submitProposal] Error:', msg);
    return { success: false, message: `Error submitting proposal: ${msg}` };
  } finally {
    await page.close();
  }
}
