import { z } from 'zod';
import { ensureLoggedIn, humanDelay } from '../browser/upwork-auth.js';

export const SendMessageSchema = z.object({
  room_id: z.string().describe('The conversation room ID to send a message to'),
  message: z
    .string()
    .describe(
      'The message content. Be professional and personalized. Mention specific details from the conversation.'
    ),
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export interface SendMessageResult {
  success: boolean;
  message: string;
  sent_at?: string;
}

export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const page = await ensureLoggedIn();

  try {
    const url = `https://www.upwork.com/messages/rooms/${input.room_id}`;
    console.error('[sendMessage] Navigating to:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(2000, 4000);

    // Wait for message input
    const inputSelectors = [
      '[data-test="message-input"]',
      '[data-cy="message-input"]',
      'div[contenteditable="true"]',
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="Message"]',
      '.message-input textarea',
      '#message-text',
    ];

    let inputEl = null;
    for (const sel of inputSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 5000 }).catch(() => false)) {
        inputEl = el;
        console.error('[sendMessage] Found input with selector:', sel);
        break;
      }
    }

    if (!inputEl) {
      return { success: false, message: 'Could not find message input box.' };
    }

    await inputEl.click();
    await humanDelay(500, 1000);

    // Type message with human-like delays
    await page.keyboard.type(input.message, { delay: Math.random() * 30 + 20 });
    console.error('[sendMessage] Message typed.');
    await humanDelay(1000, 2000);

    // Send — try Enter key first, then button
    const sendBtnSelectors = [
      '[data-test="send-message-button"]',
      '[data-cy="send-button"]',
      'button[aria-label="Send message"]',
      'button:has-text("Send")',
    ];

    let sent = false;
    for (const sel of sendBtnSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        sent = true;
        console.error('[sendMessage] Clicked send button:', sel);
        break;
      }
    }

    if (!sent) {
      // Fall back to Ctrl+Enter or Enter
      await page.keyboard.press('Enter');
      sent = true;
      console.error('[sendMessage] Sent via Enter key');
    }

    await humanDelay(2000, 3000);

    const sentAt = new Date().toISOString();
    return {
      success: true,
      message: 'Message sent successfully.',
      sent_at: sentAt,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sendMessage] Error:', msg);
    return { success: false, message: `Failed to send message: ${msg}` };
  } finally {
    await page.close();
  }
}
