import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { searchJobs, SearchJobsSchema } from './tools/search-jobs.js';
import { getJobDetails, GetJobDetailsSchema } from './tools/get-job-details.js';
import { submitProposal, SubmitProposalSchema } from './tools/submit-proposal.js';
import { getProposals, GetProposalsSchema } from './tools/get-proposals.js';
import { getMessages, GetMessagesSchema } from './tools/get-messages.js';
import { sendMessage, SendMessageSchema } from './tools/send-message.js';
import { getProfile, GetProfileSchema } from './tools/get-profile.js';
import { analyzeJob, AnalyzeJobSchema } from './tools/analyze-job.js';
import { manualLogin } from './tools/manual-login.js';
import { browserManager } from './browser/browser-manager.js';

const log = (...args: unknown[]) => console.error('[UpworkMCP]', ...args);

// ─── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: 'manual_login',
    description: `Open a visible browser window for manual Upwork login.
Use this FIRST if automatic login fails due to Cloudflare CAPTCHA or 2FA.
A Chrome window will open — complete the login yourself (solve CAPTCHA, enter 2FA if needed).
The session will be saved automatically so future tool calls won't need to login again.`,
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'search_jobs',
    description: `Search for jobs on Upwork. Optimized for n8n workflow automation niche.
Returns a list of jobs with title, budget, description snippet, required skills, client info, and proposal count.
Use this to find potential clients and opportunities.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keywords. Examples: "n8n automation", "workflow integration n8n", "make.com zapier alternative", "api integration automation"',
        },
        job_type: {
          type: 'string',
          enum: ['hourly', 'fixed', 'all'],
          description: 'Contract type. Default: "all"',
        },
        experience_level: {
          type: 'string',
          enum: ['entry', 'intermediate', 'expert', 'all'],
          description: 'Required experience level. Default: "all"',
        },
        budget_min: { type: 'number', description: 'Minimum budget in USD' },
        budget_max: { type: 'number', description: 'Maximum budget in USD' },
        posted_within_days: { type: 'number', description: 'Only jobs posted within N days. Default: 7' },
        limit: { type: 'number', description: 'Max results. Default: 10' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_job_details',
    description: `Get full details of a specific Upwork job posting.
Returns complete description, all screening questions, client history (jobs posted, hire rate, spend), required skills, budget, and proposal stats.
ALWAYS call this before submitting a proposal to get screening questions and understand client context.`,
    inputSchema: {
      type: 'object',
      properties: {
        job_url: {
          type: 'string',
          description: 'Full Upwork job URL, e.g. https://www.upwork.com/jobs/~01234567890',
        },
      },
      required: ['job_url'],
    },
  },
  {
    name: 'submit_proposal',
    description: `Submit a proposal/bid for an Upwork job.
Before calling this:
1. Call get_job_details to get screening questions
2. Craft a personalized cover letter that:
   - Opens with the client's specific problem (not "I am an expert in...")
   - Shows concrete n8n examples relevant to their use case
   - Mentions specific workflow patterns (HTTP Request, Webhook, Code node, etc.)
   - Ends with a clear CTA
3. Answer ALL screening questions thoughtfully

The agent will automatically type and submit the proposal.`,
    inputSchema: {
      type: 'object',
      properties: {
        job_url: { type: 'string', description: 'Full Upwork job URL' },
        cover_letter: { type: 'string', description: 'Full proposal text (cover letter)' },
        bid_rate: { type: 'number', description: 'Hourly rate or fixed price in USD' },
        screening_answers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Answers to screening questions in order (from get_job_details)',
        },
        boost_bid: { type: 'boolean', description: 'Use extra Connects to boost proposal. Default: false' },
      },
      required: ['job_url', 'cover_letter'],
    },
  },
  {
    name: 'get_proposals',
    description: `Get list of your submitted proposals on Upwork.
Shows status, bid rate, submission date, and whether the client is interviewing you.
Use this to track which proposals need follow-up.`,
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['active', 'archived', 'all'],
          description: 'Filter by status. Default: "active"',
        },
        limit: { type: 'number', description: 'Max results. Default: 20' },
      },
    },
  },
  {
    name: 'get_messages',
    description: `Read Upwork messages.
- Without room_id: lists all conversations with unread status and last message preview
- With room_id: reads the full message history of that conversation

Use this to check for client responses, new invitations, and ongoing contract discussions.`,
    inputSchema: {
      type: 'object',
      properties: {
        room_id: {
          type: 'string',
          description: 'Conversation room ID. Omit to list all conversations.',
        },
        limit: { type: 'number', description: 'Max messages/conversations. Default: 20' },
        unread_only: { type: 'boolean', description: 'Only unread conversations. Default: false' },
      },
    },
  },
  {
    name: 'send_message',
    description: `Send a message in an Upwork conversation.
Use this to:
- Reply to client questions about your proposal
- Follow up on submitted proposals (after 3-5 days)
- Clarify project requirements
- Communicate during an active contract

Keep messages professional, specific to the project, and value-adding.`,
    inputSchema: {
      type: 'object',
      properties: {
        room_id: { type: 'string', description: 'The conversation room ID' },
        message: { type: 'string', description: 'Message content to send' },
      },
      required: ['room_id', 'message'],
    },
  },
  {
    name: 'get_profile',
    description: `Get your Upwork freelancer profile, stats, and connects balance.
Returns: name, title, skills, hourly rate, JSS score, Top Rated status, total earnings, connects balance.
Use this to understand your current standing and available connects before bidding.`,
    inputSchema: {
      type: 'object',
      properties: {
        include_stats: {
          type: 'boolean',
          description: 'Include earnings and connects balance (requires extra page loads). Default: true',
        },
      },
    },
  },
  {
    name: 'analyze_job',
    description: `Analyze a job opportunity and score it across 5 dimensions to decide whether to apply.

Scoring breakdown (100 pts max):
- Niche Fit (30pts): How well the job matches n8n/automation keywords
- Client Quality (25pts): Rating, total spent, hire rate, location
- Budget Fit (20pts): Budget vs your target rate, estimated total project value
- Competition (10pts): Number of existing proposals (fewer = better)
- Project Clarity (10pts): How well-defined the scope is
- Red Flag Penalty (-5pts each): Vague scope, low budget signals, no client history

Returns: grade (A+/A/B/C/D/F), recommendation (APPLY NOW/APPLY/CONSIDER/SKIP/AVOID),
suggested bid, estimated project value, key selling points, and proposal tips.

RECOMMENDED WORKFLOW:
1. search_jobs → find candidates
2. get_job_details → get full info
3. analyze_job → score and decide
4. submit_proposal → if grade A or B`,
    inputSchema: {
      type: 'object',
      properties: {
        job: {
          type: 'object',
          description: 'Full job data object from get_job_details',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            url: { type: 'string' },
            budget: { type: 'string' },
            job_type: { type: 'string' },
            duration: { type: 'string' },
            experience_level: { type: 'string' },
            skills: { type: 'array', items: { type: 'string' } },
            proposals_count: { type: 'string' },
            screening_questions: { type: 'array', items: { type: 'string' } },
            client: {
              type: 'object',
              properties: {
                rating: { type: 'string' },
                total_spent: { type: 'string' },
                hire_rate: { type: 'string' },
                reviews_count: { type: 'string' },
                jobs_posted: { type: 'string' },
                location: { type: 'string' },
                member_since: { type: 'string' },
              },
            },
          },
          required: ['title', 'description'],
        },
        my_rate: {
          type: 'number',
          description: 'Your target hourly rate in USD (defaults to BID_RATE_DEFAULT env var)',
        },
      },
      required: ['job'],
    },
  },
];

// ─── MCP Server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'upwork-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  log(`Tool called: ${name}`, JSON.stringify(args).slice(0, 200));

  try {
    let result: unknown;

    switch (name) {
      case 'manual_login': {
        result = await manualLogin();
        break;
      }
      case 'search_jobs': {
        const input = SearchJobsSchema.parse(args);
        result = await searchJobs(input);
        break;
      }
      case 'get_job_details': {
        const input = GetJobDetailsSchema.parse(args);
        result = await getJobDetails(input);
        break;
      }
      case 'submit_proposal': {
        const input = SubmitProposalSchema.parse(args);
        result = await submitProposal(input);
        break;
      }
      case 'get_proposals': {
        const input = GetProposalsSchema.parse(args);
        result = await getProposals(input);
        break;
      }
      case 'get_messages': {
        const input = GetMessagesSchema.parse(args);
        result = await getMessages(input);
        break;
      }
      case 'send_message': {
        const input = SendMessageSchema.parse(args);
        result = await sendMessage(input);
        break;
      }
      case 'get_profile': {
        const input = GetProfileSchema.parse(args);
        result = await getProfile(input);
        break;
      }
      case 'analyze_job': {
        const input = AnalyzeJobSchema.parse(args);
        result = await analyzeJob(input);
        break;
      }
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('Tool error:', msg);
    return {
      content: [{ type: 'text', text: `Error: ${msg}` }],
      isError: true,
    };
  }
});

// ─── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown() {
  log('Shutting down...');
  await browserManager.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ─── Start server ──────────────────────────────────────────────────────────────

async function main() {
  log('Starting Upwork MCP Server v1.0.0');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP Server running on stdio. Ready for connections.');
}

main().catch((err) => {
  console.error('[UpworkMCP] Fatal error:', err);
  process.exit(1);
});
