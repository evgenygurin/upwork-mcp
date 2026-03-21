# upwork-mcp

A **Model Context Protocol (MCP) server** that connects Claude to Upwork — enabling AI agents to search jobs, analyze opportunities, submit proposals, and manage client communications autonomously.

Built for freelancers specializing in **n8n workflow automation**, Make.com, and API integrations.

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

---

## How It Works

```
Claude Agent
    │
    ▼
upwork-mcp (MCP Server, stdio)
    │
    ├── Playwright (headless Chromium) ─── Upwork Web UI
    │       └── Stealth mode (anti-bot detection)
    │       └── Session persistence (cookies saved to disk)
    │
    └── Upwork REST API (OAuth 1.0a) ─── Official API endpoints
```

The server communicates over **stdio** (standard MCP transport), making it compatible with Claude Desktop, Claude Code, and any MCP-compatible client.

---

## Prerequisites

- Node.js 20+
- Docker (for containerized deployment)
- An Upwork freelancer account
- (Optional) [Upwork API keys](https://www.upwork.com/developer/keys/list) for stats/earnings endpoints

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/upwork-mcp.git
cd upwork-mcp
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
UPWORK_EMAIL=your@email.com
UPWORK_PASSWORD=yourpassword

FREELANCER_TITLE=n8n Workflow Automation Expert
FREELANCER_NICHE=n8n,workflow automation,make.com

BID_RATE_DEFAULT=40
BID_RATE_MIN=25
BID_RATE_MAX=75
```

### 3. Build

```bash
npm run build
```

### 4. First-time login (visible browser)

On first run, set `BROWSER_HEADLESS=false` to see the browser and handle any 2FA:

```bash
BROWSER_HEADLESS=false npm run dev
```

The session is saved to `./sessions/upwork-session.json` and reused on subsequent runs.

---

## Connect to Claude Code

Add to your MCP config (`~/.claude/claude_desktop_config.json` or via `claude mcp add`):

```json
{
  "mcpServers": {
    "upwork": {
      "command": "node",
      "args": ["/absolute/path/to/upwork-mcp/dist/index.js"],
      "env": {
        "UPWORK_EMAIL": "your@email.com",
        "UPWORK_PASSWORD": "yourpassword",
        "FREELANCER_TITLE": "n8n Workflow Automation Expert",
        "BID_RATE_DEFAULT": "40",
        "BROWSER_HEADLESS": "true"
      }
    }
  }
}
```

Or using Claude Code CLI:

```bash
claude mcp add upwork node /absolute/path/to/upwork-mcp/dist/index.js
```

---

## Docker Deployment

```bash
# Copy and configure env
cp .env.example .env

# Build and run
docker compose up --build -d
```

The session volume (`upwork_sessions`) persists login state across container restarts.

---

## Recommended Agent Workflow

The intended workflow for the Claude agent:

```
1. get_profile          → Check connects balance before bidding
2. search_jobs          → Find n8n/automation jobs (e.g., query: "n8n workflow")
3. get_job_details      → Get full description + screening questions
4. analyze_job          → Score the opportunity (skip if grade D or F)
5. submit_proposal      → Auto-bid with personalized cover letter
6. get_messages         → Check for client responses (run periodically)
7. send_message         → Reply to clients
8. get_proposals        → Track active proposals
```

### Example agent prompt

```
Search for n8n automation jobs posted in the last 3 days.
For each job with grade A or B:
1. Get full details
2. Analyze the opportunity
3. Write a personalized proposal focusing on my n8n expertise
4. Submit the proposal at the recommended bid rate
```

---

## Job Analysis Scoring

The `analyze_job` tool scores each job across 5 dimensions:

| Dimension | Max Points | What It Measures |
|-----------|-----------|-----------------|
| Niche Fit | 30 | n8n/automation keywords in title, description, skills |
| Client Quality | 25 | Rating, total spend, hire rate, location |
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
│   ├── index.ts                  # MCP Server entry (tool registry + stdio transport)
│   ├── config.ts                 # Environment configuration
│   ├── browser/
│   │   ├── browser-manager.ts    # Playwright singleton with stealth patches
│   │   └── upwork-auth.ts        # Login flow + session persistence
│   ├── api/
│   │   └── upwork-api.ts         # Upwork REST API client (OAuth 1.0a)
│   └── tools/
│       ├── search-jobs.ts
│       ├── get-job-details.ts
│       ├── analyze-job.ts        # Scoring engine
│       ├── submit-proposal.ts
│       ├── get-proposals.ts
│       ├── get-messages.ts
│       ├── send-message.ts
│       └── get-profile.ts
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Important Notes

### Bot Detection
Upwork actively detects automation. This server uses:
- Headless Chromium with `navigator.webdriver` removed
- Randomized typing delays
- Tracking/analytics requests blocked
- Realistic user agent and viewport

Despite these measures, Upwork may still flag unusual activity. Use reasonable request intervals and do not run the agent 24/7.

### Selector Stability
Upwork's UI changes periodically. Browser-based selectors in `src/tools/` may need updating if the UI is redesigned. The server uses multiple fallback selectors for resilience.

### Ethical Use
- Only automate your own account
- Comply with [Upwork's Terms of Service](https://www.upwork.com/legal/terms-of-use/)
- Review proposals before submission in production use

---

## Development

```bash
# Run in development mode (hot reload)
npm run dev

# Build for production
npm run build

# Run built version
npm start
```

---

## License

MIT
