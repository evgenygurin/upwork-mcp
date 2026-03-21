import { z } from 'zod';
import { ensureLoggedIn, humanDelay } from '../browser/upwork-auth.js';

export const GetMessagesSchema = z.object({
  room_id: z
    .string()
    .optional()
    .describe(
      'Specific conversation room ID to read. If omitted, returns list of all conversations.'
    ),
  limit: z.number().optional().default(20).describe('Max messages or conversations to return'),
  unread_only: z
    .boolean()
    .optional()
    .default(false)
    .describe('Only return conversations with unread messages'),
});

export type GetMessagesInput = z.infer<typeof GetMessagesSchema>;

export interface Conversation {
  room_id: string;
  participant_name: string;
  participant_type: string; // 'client' | 'agency' | etc
  last_message_preview: string;
  last_message_at: string;
  unread: boolean;
  job_title: string;
  room_url: string;
}

export interface Message {
  id: string;
  sender: string;
  content: string;
  sent_at: string;
  is_mine: boolean;
}

export interface GetMessagesResult {
  conversations?: Conversation[];
  messages?: Message[];
  room_id?: string;
  participant_name?: string;
}

export async function getMessages(input: GetMessagesInput): Promise<GetMessagesResult> {
  const page = await ensureLoggedIn();

  try {
    if (input.room_id) {
      // Read specific conversation
      const url = `https://www.upwork.com/messages/rooms/${input.room_id}`;
      console.error('[getMessages] Reading conversation:', url);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await humanDelay(2000, 4000);

      await page.waitForSelector('[data-test="message-list"], .message-list, .messages', {
        timeout: 15000,
      }).catch(() => console.error('[getMessages] Message list selector not found'));

      await humanDelay(1000, 2000);

      const result = await page.evaluate(
        ({ limit, room_id }: { limit: number; room_id: string }): GetMessagesResult => {
          const participantEl = document.querySelector(
            '[data-test="room-participant-name"], .room-header-name, h1'
          );
          const participant_name = participantEl?.textContent?.trim() ?? '';

          const messageEls = document.querySelectorAll(
            '[data-test="message-item"], .message-item, .chat-message'
          );
          const messages: Message[] = [];

          Array.from(messageEls)
            .slice(-limit)
            .forEach((el, i) => {
              const isMine =
                el.classList.contains('outgoing') ||
                el.classList.contains('sent') ||
                el.querySelector('[data-test="my-message"]') !== null;

              messages.push({
                id: el.getAttribute('data-id') ?? `msg_${i}`,
                sender:
                  el
                    .querySelector('[data-test="sender-name"], .sender-name')
                    ?.textContent?.trim() ?? (isMine ? 'Me' : participant_name),
                content:
                  el
                    .querySelector('[data-test="message-text"], .message-text, p')
                    ?.textContent?.trim() ?? '',
                sent_at:
                  el.querySelector('time')?.getAttribute('datetime') ??
                  el.querySelector('time')?.textContent?.trim() ??
                  '',
                is_mine: isMine,
              });
            });

          return { messages, room_id, participant_name };
        },
        { limit: input.limit, room_id: input.room_id }
      );

      console.error(`[getMessages] Got ${result.messages?.length ?? 0} messages`);
      return result;
    } else {
      // List all conversations
      console.error('[getMessages] Listing conversations...');
      await page.goto('https://www.upwork.com/messages/rooms', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await humanDelay(2000, 4000);

      await page.waitForSelector(
        '[data-test="room-list"], .room-list, .conversation-list, aside',
        { timeout: 15000 }
      ).catch(() => console.error('[getMessages] Room list selector not found'));

      await humanDelay(1000, 2000);

      const result = await page.evaluate(
        ({ limit, unreadOnly }: { limit: number; unreadOnly: boolean }): GetMessagesResult => {
          const roomEls = document.querySelectorAll(
            '[data-test="room-item"], .room-item, .conversation-item'
          );
          const conversations: Conversation[] = [];

          roomEls.forEach((el, i) => {
            if (i >= limit) return;

            const unread =
              el.classList.contains('unread') ||
              el.querySelector('.unread-badge, [data-test="unread"]') !== null;

            if (unreadOnly && !unread) return;

            const linkEl = el.querySelector('a[href*="/messages/rooms/"]');
            const href = linkEl?.getAttribute('href') ?? '';
            const roomIdMatch = href.match(/rooms\/([^/\s?]+)/);
            const room_id = roomIdMatch?.[1] ?? `room_${i}`;
            const room_url = href.startsWith('http')
              ? href
              : `https://www.upwork.com${href}`;

            conversations.push({
              room_id,
              room_url,
              participant_name:
                el
                  .querySelector(
                    '[data-test="participant-name"], .participant-name, .room-name, strong'
                  )
                  ?.textContent?.trim() ?? '',
              participant_type: 'client',
              last_message_preview:
                el
                  .querySelector('[data-test="last-message"], .last-message, p')
                  ?.textContent?.trim()
                  .slice(0, 100) ?? '',
              last_message_at:
                el.querySelector('time')?.textContent?.trim() ?? '',
              unread,
              job_title:
                el
                  .querySelector('[data-test="job-title"], .job-title')
                  ?.textContent?.trim() ?? '',
            });
          });

          return { conversations };
        },
        { limit: input.limit, unreadOnly: input.unread_only }
      );

      console.error(`[getMessages] Found ${result.conversations?.length ?? 0} conversations`);
      return result;
    }
  } finally {
    await page.close();
  }
}
