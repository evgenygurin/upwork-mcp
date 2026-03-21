# upwork-mcp

A **Model Context Protocol (MCP) server** that connects Claude to Upwork — enabling AI agents to search jobs, analyze opportunities, submit proposals, and manage client communications autonomously.

Works for any freelance niche: development, design, writing, marketing, automation, and more.

---

## Features

| Tool | Description |
|------|-------------|
| `search_jobs` | Search Upwork jobs by keyword, type, budget, experience level |
| `get_job_details` | Fetch full job description, screening questions, and client history |
| `analyze_job` | Score a job 0–100 across niche fit, client quality, budget, competition, and clarity |
| `submit_proposal` | Automatically write and submit a proposal with custom cover letter and bid |
| `get_proposals` | List submitted proposals and their current status |
| `get_messages` | Read conversations and check for unread messages |
| `send_message` | Reply to clients in ongoing conversations |
| `get_profile` | View your freelancer profile, JSS score, and connects balance |
| `update_profile` | Update your freelancer profile title, overview, and skills |
| `manual_login` | Capture session cookies from an already-logged-in Chrome tab |

---

## Architecture

```
Claude Agent
    │
    ▼
MCP Gateway (stdio, never restarts)
    │  HTTP POST /tool
    ▼
Worker Server (port 47821, hot-reloads on code changes)
    │
    ▼
CDP Proxy (port 9223, rewrites Host headers)
    │
    ▼
Chrome on host (port 9222, Playwright CDP connection)
    │
    ▼
Upwork Web UI
```

The **gateway/worker split** means you can update tool logic without restarting Claude or your MCP client.

---

## Prerequisites

- Node.js 20+
- Docker + Docker Compose
- Google Chrome installed
- An Upwork freelancer account

---

## Quick Start (Docker)

### 1. Clone and configure

```bash
git clone https://github.com/zcrossoverz/upwork-mcp.git
cd upwork-mcp
cp .env.example .env
```

Edit `.env`:

```env
UPWORK_EMAIL=your@email.com
UPWORK_PASSWORD=yourpassword

FREELANCER_NAME=Your Name
FREELANCER_TITLE=Your Professional Title
FREELANCER_NICHE=your,skills,here

BID_RATE_DEFAULT=40
BID_RATE_MIN=25
BID_RATE_MAX=100
```

### 2. Start Chrome with CDP

```bat
connect-chrome-docker.bat
```

This launches Chrome with remote debugging + a CDP proxy that allows Docker to connect.

### 3. Start the worker

```bash
docker compose up -d
```

### 4. Capture your session

In Claude, call `manual_login` — it extracts cookies from your logged-in Chrome tab and saves the session. You only need to do this once (or after your session expires).

---

## Connect to Claude Code

Add to your MCP config (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "upwork": {
      "command": "node",
      "args": ["/absolute/path/to/upwork-mcp/dist/gateway.js"],
      "env": {
        "WORKER_PORT": "47821"
      }
    }
  }
}
```

Or via CLI:

```bash
claude mcp add upwork node /absolute/path/to/upwork-mcp/dist/gateway.js
```

---

## Local Development (Hot Reload)

```bash
npm install
npm run worker   # starts tsc --watch + nodemon on dist/worker.js
```

The gateway (`dist/gateway.js`) runs separately and proxies to the local worker — changes to any tool file reload the worker instantly without restarting Claude.

---

## Recommended Agent Workflow

```
1. manual_login      → Capture session (first time / session expired)
2. get_profile       → Check connects balance before bidding
3. search_jobs       → Find relevant jobs by keyword
4. get_job_details   → Get full description + screening questions
5. analyze_job       → Score the opportunity (skip grade D or F)
6. submit_proposal   → Auto-bid with personalized cover letter
7. get_messages      → Check for client responses
8. send_message      → Reply to clients
9. get_proposals     → Track active proposals
```

### Example agent prompt

```
Search for freelance jobs matching my skills posted in the last 3 days.
For each job with grade A or B:
1. Get full job details
2. Analyze the opportunity
3. Write a personalized proposal highlighting my relevant experience
4. Submit at the recommended bid rate
```

---

## Job Analysis Scoring

The `analyze_job` tool scores each job across 5 dimensions:

| Dimension | Max Points | What It Measures |
|-----------|-----------|-----------------|
| Niche Fit | 30 | Keyword match between job and your `FREELANCER_NICHE` |
| Client Quality | 25 | Rating, total spend, hire rate, payment verified |
| Budget Fit | 20 | Budget vs your target rate, estimated project value |
| Competition | 10 | Number of existing proposals (fewer = better) |
| Project Clarity | 10 | Description detail, skills listed, budget specified |
| Red Flags | -5 each | Vague scope, low-budget signals, no client history |

**Grades:**

| Grade | Score | Action |
|-------|-------|--------|
| A+ | 90–100 | APPLY NOW — high priority |
| A | 75–89 | APPLY — strong opportunity |
| B | 60–74 | APPLY — worth pursuing |
| C | 45–59 | CONSIDER — marginal fit |
| D | 30–44 | SKIP |
| F | <30 | AVOID |

---

## Project Structure

```
upwork-mcp/
├── src/
│   ├── gateway.ts                # MCP stdio gateway (thin proxy, never restarts)
│   ├── worker.ts                 # HTTP tool server (hot-reloads via nodemon)
│   ├── config.ts                 # Environment configuration
│   ├── browser/
│   │   ├── browser-manager.ts    # Playwright CDP connection manager
│   │   └── upwork-auth.ts        # Session management
│   └── tools/
│       ├── search-jobs.ts
│       ├── get-job-details.ts
│       ├── analyze-job.ts        # Scoring engine
│       ├── submit-proposal.ts
│       ├── get-proposals.ts
│       ├── get-messages.ts
│       ├── send-message.ts
│       ├── get-profile.ts
│       ├── update-profile.ts
│       └── manual-login.ts       # CDP cookie extractor
├── cdp-proxy.cjs                 # Host-side proxy: Docker → Chrome (fixes Host header)
├── connect-chrome-docker.bat     # Launch Chrome + CDP proxy (for Docker use)
├── connect-chrome.bat            # Launch Chrome only (for local use)
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Notes

### Session Management
Login is handled manually via `manual_login`. Open Chrome, log in to Upwork normally (including any 2FA), then call `manual_login` — it captures all cookies and saves them for Playwright to reuse.

### Bot Detection
Upwork may detect unusual activity. Use reasonable request intervals and do not run the agent continuously. The server connects to your real Chrome profile via CDP, which behaves more like a real browser than headless automation.

### Selector Stability
Upwork's UI changes periodically. Browser-based selectors in `src/tools/` may need updating if the UI is redesigned.

### Ethical Use
- Only automate your own account
- Comply with [Upwork's Terms of Service](https://www.upwork.com/legal/terms-of-use/)
- Review proposals before submission in production use

---

## License

MIT
