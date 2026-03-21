/**
 * MCP Gateway — thin stdio bridge, connects to worker HTTP server.
 * Never needs to restart. Start once, stays running.
 * Configured in claude_desktop_config.json.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from '@modelcontextprotocol/sdk/types.js';
import http from 'http';

const WORKER_PORT = parseInt(process.env.WORKER_PORT ?? '47821');
const WORKER_URL = `http://127.0.0.1:${WORKER_PORT}`;
const log = (...a: unknown[]) => console.error('[Gateway]', ...a);

// ─── Call worker ────────────────────────────────────────────────────────────

async function callWorker(name: string, args: unknown): Promise<unknown> {
  const payload = JSON.stringify({ name, args });
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${WORKER_URL}/tool`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(body) as { ok: boolean; result?: unknown; error?: string };
            if (json.ok) resolve(json.result);
            else reject(new Error(json.error ?? 'Worker error'));
          } catch { reject(new Error(`Invalid worker response: ${body.slice(0, 200)}`)); }
        });
      }
    );
    req.on('error', (err) => {
      reject(new Error(
        `Worker not running. Start it with: npm run worker\nOriginal: ${err.message}`
      ));
    });
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Tool timeout (120s)')); });
    req.write(payload);
    req.end();
  });
}

// ─── Tool list ───────────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: 'manual_login',
    description: 'Connect to existing Chrome tab via CDP and save Upwork session cookies. Run connect-chrome.bat first, then call this.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'save_session',
    description: 'Alias for manual_login — re-save session from current Chrome tab.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_profile',
    description: 'Get your Upwork freelancer profile, title, skills, hourly rate, JSS score, connects balance.',
    inputSchema: { type: 'object', properties: { include_stats: { type: 'boolean' } } },
  },
  {
    name: 'update_profile',
    description: 'Update your Upwork profile fields: title, description/bio, hourly_rate, skills.',
    inputSchema: {
      type: 'object',
      properties: {
        title:       { type: 'string' },
        description: { type: 'string' },
        hourly_rate: { type: ['number', 'string'] },
        skills:      { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'search_jobs',
    description: 'Search Upwork jobs. Optimized for n8n/automation niche. Returns job list with budget, client info, proposal count.',
    inputSchema: {
      type: 'object',
      properties: {
        query:             { type: 'string' },
        job_type:          { type: 'string', enum: ['hourly', 'fixed', 'all'] },
        experience_level:  { type: 'string', enum: ['entry', 'intermediate', 'expert', 'all'] },
        budget_min:        { type: ['number', 'string'] },
        budget_max:        { type: ['number', 'string'] },
        posted_within_days:{ type: ['number', 'string'] },
        limit:             { type: ['number', 'string'] },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_job_details',
    description: 'Get full job details: description, screening questions, client history, budget. Call this before submit_proposal.',
    inputSchema: { type: 'object', properties: { job_url: { type: 'string' } }, required: ['job_url'] },
  },
  {
    name: 'submit_proposal',
    description: 'Submit a proposal for an Upwork job. Call get_job_details first to get screening questions.',
    inputSchema: {
      type: 'object',
      properties: {
        job_url:            { type: 'string' },
        cover_letter:       { type: 'string' },
        bid_rate:           { type: ['number', 'string'] },
        screening_answers:  { type: 'array', items: { type: 'string' } },
        boost_bid:          { type: 'boolean' },
      },
      required: ['job_url', 'cover_letter'],
    },
  },
  {
    name: 'get_proposals',
    description: 'Get your submitted proposals with status and client response.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'archived', 'all'] },
        limit:  { type: ['number', 'string'] },
      },
    },
  },
  {
    name: 'get_messages',
    description: 'Read Upwork messages. Without room_id: lists conversations. With room_id: reads full message history.',
    inputSchema: {
      type: 'object',
      properties: {
        room_id:     { type: 'string' },
        limit:       { type: ['number', 'string'] },
        unread_only: { type: 'boolean' },
      },
    },
  },
  {
    name: 'send_message',
    description: 'Send a message in an Upwork conversation.',
    inputSchema: {
      type: 'object',
      properties: { room_id: { type: 'string' }, message: { type: 'string' } },
      required: ['room_id', 'message'],
    },
  },
  {
    name: 'analyze_job',
    description: `Score a job opportunity 0-100 across 5 dimensions: niche fit, client quality, budget fit, competition, clarity.
Returns grade (A+/A/B/C/D/F), recommendation (APPLY NOW / APPLY / CONSIDER / SKIP / AVOID), suggested bid, selling points.`,
    inputSchema: {
      type: 'object',
      properties: {
        job: {
          type: 'object',
          properties: {
            title:       { type: 'string' },
            description: { type: 'string' },
            budget:      { type: 'string' },
            job_type:    { type: 'string' },
            skills:      { type: 'array', items: { type: 'string' } },
            proposals_count: { type: 'string' },
            client: { type: 'object' },
          },
          required: ['title', 'description'],
        },
        my_rate: { type: ['number', 'string'] },
      },
      required: ['job'],
    },
  },
];

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'upwork-mcp', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  log(`→ ${name}`);
  try {
    const result = await callWorker(name, args ?? {});
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`✗ ${name}: ${msg}`);
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
log('Gateway running. Worker expected at', WORKER_URL);
