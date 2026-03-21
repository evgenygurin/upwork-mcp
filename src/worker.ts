/**
 * Tool Worker — HTTP server that handles actual Upwork tool execution.
 * Runs separately from the MCP gateway.
 * Auto-reloaded by nodemon when any .ts file changes.
 * Start with: npm run worker
 */
import http from 'http';
import { searchJobs, SearchJobsSchema } from './tools/search-jobs.js';
import { getJobDetails, GetJobDetailsSchema } from './tools/get-job-details.js';
import { submitProposal, SubmitProposalSchema } from './tools/submit-proposal.js';
import { getProposals, GetProposalsSchema } from './tools/get-proposals.js';
import { getMessages, GetMessagesSchema } from './tools/get-messages.js';
import { sendMessage, SendMessageSchema } from './tools/send-message.js';
import { getProfile, GetProfileSchema } from './tools/get-profile.js';
import { analyzeJob, AnalyzeJobSchema } from './tools/analyze-job.js';
import { manualLogin, saveSession } from './tools/manual-login.js';
import { updateProfile, UpdateProfileSchema } from './tools/update-profile.js';

const PORT = parseInt(process.env.WORKER_PORT ?? '47821');
const log = (...a: unknown[]) => console.error('[Worker]', ...a);

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'manual_login':    return manualLogin();
    case 'save_session':    return saveSession();
    case 'get_profile':     return getProfile(GetProfileSchema.parse(args));
    case 'update_profile':  return updateProfile(UpdateProfileSchema.parse(args));
    case 'search_jobs':     return searchJobs(SearchJobsSchema.parse(args));
    case 'get_job_details': return getJobDetails(GetJobDetailsSchema.parse(args));
    case 'submit_proposal': return submitProposal(SubmitProposalSchema.parse(args));
    case 'get_proposals':   return getProposals(GetProposalsSchema.parse(args));
    case 'get_messages':    return getMessages(GetMessagesSchema.parse(args));
    case 'send_message':    return sendMessage(SendMessageSchema.parse(args));
    case 'analyze_job': {
      // job may arrive as a JSON string if MCP serialized it
      if (typeof args.job === 'string') {
        try { args.job = JSON.parse(args.job as string); } catch { /* leave as-is */ }
      }
      return analyzeJob(AnalyzeJobSchema.parse(args));
    }
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: '2.0.0' }));
    return;
  }
  if (req.method !== 'POST' || req.url !== '/tool') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const { name, args } = JSON.parse(body);
      log(`→ ${name}`, JSON.stringify(args).slice(0, 100));
      const result = await runTool(name, args ?? {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`✗ Error:`, msg);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: msg }));
    }
  });
});

const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
server.listen(PORT, HOST, () => {
  log(`Worker ready on http://${HOST}:${PORT}`);
});

process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT',  () => { server.close(); process.exit(0); });
