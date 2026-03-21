import { z } from 'zod';
import { ensureLoggedIn, humanDelay } from '../browser/upwork-auth.js';
import type { Page } from 'playwright';

export const UpdateProfileSchema = z.object({
  title: z.string().optional().describe('Professional title, e.g. "n8n Workflow Automation Expert"'),
  description: z.string().optional().describe('Profile overview/bio text'),
  hourly_rate: z.coerce.number().optional().describe('Hourly rate in USD'),
  skills: z.array(z.string()).optional().describe('List of skills to add'),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

const log = (...a: unknown[]) => console.error('[UpdateProfile]', ...a);

async function getProfileUrl(page: Page): Promise<string> {
  await page.goto('https://www.upwork.com/freelancers/settings/profile', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  });
  await humanDelay(1500, 2500);
  const href = await page.evaluate(() =>
    document.querySelector('a[href*="/freelancers/~"]')?.getAttribute('href') ?? ''
  );
  if (!href) throw new Error('Could not find profile URL');
  return href.startsWith('http') ? href : `https://www.upwork.com${href}`;
}

/** Click an edit button by aria-label, wait for modal/form to appear */
async function clickEditButton(page: Page, ariaLabel: string): Promise<boolean> {
  try {
    const btn = page.locator(`button[aria-label="${ariaLabel}"]`).first();
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await btn.click();
    await humanDelay(800, 1500);
    return true;
  } catch {
    log(`Edit button "${ariaLabel}" not found`);
    return false;
  }
}

/** Wait for a modal/drawer to appear */
async function waitForModal(page: Page): Promise<void> {
  await page.waitForSelector(
    '[role="dialog"], [class*="modal"], [class*="drawer"], [class*="slide-panel"]',
    { state: 'visible', timeout: 8000 }
  ).catch(() => log('Modal not detected, continuing anyway'));
  await humanDelay(500, 1000);
}

/** Clear and fill a text input/textarea — uses pressSequentially to trigger React events */
async function fillField(page: Page, selector: string, value: string): Promise<boolean> {
  try {
    const el = page.locator(selector).first();
    await el.waitFor({ state: 'visible', timeout: 5000 });
    await el.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await humanDelay(100, 200);
    // pressSequentially fires keydown/keypress/input/keyup — React picks these up
    await el.pressSequentially(value, { delay: 8 });
    await humanDelay(300, 500);
    return true;
  } catch {
    return false;
  }
}

/** Click Save/Submit button in a modal — waits for it to become enabled (React validation) */
async function saveModal(page: Page): Promise<boolean> {
  const saveSelectors = [
    'button[type="submit"]',
    'button:has-text("Save")',
    'button:has-text("Apply")',
    'button:has-text("Done")',
    '[data-test="save-btn"]',
  ];
  for (const sel of saveSelectors) {
    try {
      const btn = page.locator(sel).first();
      const visible = await btn.isVisible({ timeout: 2000 }).catch(() => false);
      if (!visible) continue;
      // Wait for button to be enabled (React re-enables after valid input)
      await btn.waitFor({ state: 'visible', timeout: 5000 });
      // Poll for enabled state up to 5s
      for (let i = 0; i < 10; i++) {
        const disabled = await btn.isDisabled().catch(() => true);
        if (!disabled) break;
        await humanDelay(500, 600);
      }
      await btn.click({ force: true }); // force=true to click even if briefly disabled
      await humanDelay(1000, 2000);
      return true;
    } catch { /* try next */ }
  }
  return false;
}

export async function updateProfile(input: UpdateProfileInput): Promise<{
  success: boolean; updated: string[]; errors: string[];
}> {
  const page = await ensureLoggedIn();
  const updated: string[] = [];
  const errors: string[] = [];

  try {
    const profileUrl = await getProfileUrl(page);
    log('Profile URL:', profileUrl);

    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(3000, 4000);

    // ── Update Title ──────────────────────────────────────────────────
    if (input.title) {
      log('Updating title...');
      if (await clickEditButton(page, 'Edit title')) {
        await waitForModal(page);
        const filled = await fillField(page, 'input[name*="title"], input[placeholder*="title"], input[id*="title"]', input.title)
          || await fillField(page, 'input[type="text"]', input.title);
        if (filled && await saveModal(page)) {
          updated.push(`title: "${input.title}"`);
          log('Title updated.');
        } else {
          errors.push('title: could not fill/save');
        }
      } else {
        errors.push('title: edit button not found');
      }
    }

    // ── Update Hourly Rate ────────────────────────────────────────────
    if (input.hourly_rate) {
      log('Updating hourly rate...');
      if (await clickEditButton(page, 'Edit hourly rate')) {
        await waitForModal(page);
        const filled = await fillField(page, 'input[name*="rate"], input[placeholder*="rate"], input[type="number"]', String(input.hourly_rate));
        if (filled && await saveModal(page)) {
          updated.push(`hourly_rate: $${input.hourly_rate}`);
          log('Hourly rate updated.');
        } else {
          errors.push('hourly_rate: could not fill/save');
        }
      } else {
        errors.push('hourly_rate: edit button not found');
      }
    }

    // ── Update Description / Overview ────────────────────────────────
    if (input.description) {
      log('Updating description...');
      const descBtnLabels = ['Edit overview', 'Edit description', 'Edit bio', 'Edit professional overview', 'Edit summary'];
      let descOpened = false;
      for (const label of descBtnLabels) {
        if (await clickEditButton(page, label)) { descOpened = true; break; }
      }
      if (descOpened) {
        await waitForModal(page);
        // Try known textarea selectors (Upwork uses #profile-description)
        let filled = await fillField(page, '#profile-description', input.description)
          || await fillField(page, 'textarea[id*="description"], textarea[id*="overview"], textarea[id*="bio"]', input.description)
          || await fillField(page, 'textarea', input.description);
        if (!filled) {
          // Contenteditable: select all + type
          try {
            const editor = page.locator('[contenteditable="true"]').first();
            await editor.waitFor({ state: 'visible', timeout: 5000 });
            await editor.click();
            await page.keyboard.press('Control+a');
            await page.keyboard.type(input.description, { delay: 10 });
            filled = true;
          } catch { /* noop */ }
        }
        if (filled && await saveModal(page)) {
          updated.push('description updated');
          log('Description updated.');
        } else {
          errors.push('description: could not fill/save');
        }
      } else {
        errors.push('description: edit button not found (tried: ' + descBtnLabels.join(', ') + ')');
      }
    }

    // ── Update Skills ─────────────────────────────────────────────────
    if (input.skills?.length) {
      log('Updating skills...');
      if (await clickEditButton(page, 'Edit skills')) {
        await waitForModal(page);

        for (const skill of input.skills) {
          try {
            // Type into skills search input
            const skillInput = page.locator('input[placeholder*="skill"], input[placeholder*="Search"]').first();
            await skillInput.waitFor({ state: 'visible', timeout: 5000 });
            await skillInput.fill(skill);
            await humanDelay(800, 1200);

            // Click first suggestion
            const suggestion = page.locator('[class*="suggestion"], [class*="option"], [role="option"]').first();
            const hasSuggestion = await suggestion.isVisible({ timeout: 3000 }).catch(() => false);
            if (hasSuggestion) {
              await suggestion.click();
              await humanDelay(400, 700);
              updated.push(`skill: "${skill}"`);
            } else {
              // Try pressing Enter
              await skillInput.press('Enter');
              await humanDelay(400, 700);
              updated.push(`skill: "${skill}" (enter)`);
            }
          } catch (e) {
            errors.push(`skill "${skill}": ${e instanceof Error ? e.message : e}`);
          }
        }

        if (await saveModal(page)) {
          log('Skills saved.');
        } else {
          errors.push('skills: could not save');
        }
      } else {
        errors.push('skills: edit button not found');
      }
    }

    return { success: errors.length === 0, updated, errors };
  } finally {
    await page.close();
  }
}
