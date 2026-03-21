import { z } from 'zod';
import { config } from '../config.js';
import type { JobDetails } from './get-job-details.js';

export const AnalyzeJobSchema = z.object({
  job: z
    .object({
      id: z.string().optional(),
      title: z.string(),
      url: z.string().optional(),
      description: z.string(),
      budget: z.string().optional(),
      job_type: z.string().optional(),
      duration: z.string().optional(),
      experience_level: z.string().optional(),
      posted_at: z.string().optional(),
      skills: z.array(z.string()).optional(),
      category: z.string().optional(),
      screening_questions: z.array(z.string()).optional(),
      proposals_count: z.string().optional(),
      connects_required: z.string().optional(),
      client: z
        .object({
          name: z.string().optional(),
          location: z.string().optional(),
          rating: z.string().optional(),
          reviews_count: z.string().optional(),
          jobs_posted: z.string().optional(),
          hire_rate: z.string().optional(),
          total_spent: z.string().optional(),
          member_since: z.string().optional(),
        })
        .optional(),
    })
    .describe('Job data from get_job_details'),
  my_rate: z
    .coerce.number()
    .optional()
    .describe('Your target hourly rate in USD. Defaults to BID_RATE_DEFAULT from config.'),
});

export type AnalyzeJobInput = z.infer<typeof AnalyzeJobSchema>;

// ─── Score weights ─────────────────────────────────────────────────────────────
const WEIGHTS = {
  niche_fit: 30,         // How well job matches n8n/automation niche
  client_quality: 25,   // Client credibility (rating, spend, hire rate)
  budget_fit: 20,       // Budget vs your rate
  competition: 10,      // Number of proposals (lower = better)
  project_clarity: 10,  // How well-defined the project is
  red_flags: -5,        // Penalty for red flags (per flag)
} as const;

const N8N_KEYWORDS = [
  'n8n', 'n8n.io', 'workflow automation', 'workflow builder', 'workflow integration',
  'process automation', 'automation workflow', 'no-code automation', 'low-code',
  'make.com', 'integromat', 'zapier alternative', 'api integration', 'webhook',
  'data pipeline', 'etl automation', 'business automation', 'task automation',
  'crm automation', 'lead automation', 'slack automation', 'notion automation',
  'airtable automation', 'google sheets automation', 'email automation',
];

const RELATED_KEYWORDS = [
  'zapier', 'make', 'automate', 'integration', 'connect', 'sync', 'trigger',
  'workflow', 'pipeline', 'node.js', 'rest api', 'graphql', 'webhook',
  'automation', 'bot', 'scraping', 'data extraction', 'reporting automation',
];

const RED_FLAG_KEYWORDS = [
  'must start immediately', 'unpaid trial', 'spec work', 'very simple',
  'easy task', 'should only take', 'just a few hours', 'quick job',
  'very low budget', 'poor budget', '$5', '$10', 'no experience needed',
  'anyone can do', 'looking for the cheapest',
];

// ─── Scoring functions ─────────────────────────────────────────────────────────

function scoreNicheFit(job: AnalyzeJobInput['job']): {
  score: number;
  max: number;
  details: string[];
} {
  const text = `${job.title} ${job.description} ${(job.skills ?? []).join(' ')}`.toLowerCase();
  const details: string[] = [];
  let hits = 0;

  // Direct n8n/core automation keywords
  const directHits = N8N_KEYWORDS.filter((kw) => text.includes(kw.toLowerCase()));
  if (directHits.length > 0) {
    hits += Math.min(directHits.length * 15, 45); // Up to 45pts from direct
    details.push(`Direct match: ${directHits.slice(0, 5).join(', ')}`);
  }

  // Related keywords (lower weight)
  const relatedHits = RELATED_KEYWORDS.filter((kw) => text.includes(kw.toLowerCase()));
  if (relatedHits.length > 0) {
    hits += Math.min(relatedHits.length * 5, 25);
    details.push(`Related: ${relatedHits.slice(0, 5).join(', ')}`);
  }

  // Title match (bonus — title match is stronger signal)
  const titleLower = job.title.toLowerCase();
  if (N8N_KEYWORDS.some((kw) => titleLower.includes(kw.toLowerCase()))) {
    hits += 20;
    details.push('Keyword in title (strong signal)');
  }

  const score = Math.min(hits, WEIGHTS.niche_fit);

  if (score === 0) details.push('No automation keywords found');
  return { score, max: WEIGHTS.niche_fit, details };
}

function scoreClientQuality(client: AnalyzeJobInput['job']['client']): {
  score: number;
  max: number;
  details: string[];
} {
  if (!client) return { score: 5, max: WEIGHTS.client_quality, details: ['No client data available'] };

  const details: string[] = [];
  let score = 0;

  // Rating (0–5 stars)
  const rating = parseFloat(client.rating ?? '0');
  if (rating >= 4.8) { score += 8; details.push(`Excellent rating: ${rating}★`); }
  else if (rating >= 4.5) { score += 6; details.push(`Good rating: ${rating}★`); }
  else if (rating >= 4.0) { score += 4; details.push(`Average rating: ${rating}★`); }
  else if (rating > 0) { score += 1; details.push(`Low rating: ${rating}★ (risk)`); }
  else { details.push('No rating yet (new client)'); }

  // Total spent
  const spentText = client.total_spent ?? '';
  const spentMatch = spentText.match(/[\d,]+\.?\d*/);
  const spent = spentMatch ? parseFloat(spentMatch[0].replace(',', '')) : 0;
  const spentK = spent / 1000;

  if (spentK >= 100) { score += 7; details.push(`High spender: $${spentK.toFixed(0)}K total`); }
  else if (spentK >= 10) { score += 5; details.push(`Good spender: $${spentK.toFixed(0)}K total`); }
  else if (spentK >= 1) { score += 3; details.push(`Moderate spender: $${spentK.toFixed(1)}K total`); }
  else if (spent > 0) { score += 1; details.push(`Low spend: $${spent} total`); }
  else { details.push('No spending history'); }

  // Hire rate
  const hireRateText = client.hire_rate ?? '';
  const hireMatch = hireRateText.match(/(\d+)/);
  const hireRate = hireMatch ? parseInt(hireMatch[1]) : 0;

  if (hireRate >= 80) { score += 5; details.push(`High hire rate: ${hireRate}%`); }
  else if (hireRate >= 50) { score += 3; details.push(`Medium hire rate: ${hireRate}%`); }
  else if (hireRate > 0) { score += 1; details.push(`Low hire rate: ${hireRate}%`); }

  // Reviews count (active client indicator)
  const reviewsMatch = (client.reviews_count ?? '').match(/(\d+)/);
  const reviews = reviewsMatch ? parseInt(reviewsMatch[1]) : 0;
  if (reviews >= 20) { score += 3; details.push(`Experienced buyer: ${reviews} reviews`); }
  else if (reviews >= 5) { score += 2; details.push(`${reviews} reviews`); }

  // Location bonus (English-speaking countries tend to have larger budgets)
  const location = (client.location ?? '').toLowerCase();
  const highValueLocations = ['united states', 'united kingdom', 'canada', 'australia', 'germany', 'netherlands'];
  if (highValueLocations.some((loc) => location.includes(loc))) {
    score += 2;
    details.push(`High-value location: ${client.location}`);
  }

  return { score: Math.min(score, WEIGHTS.client_quality), max: WEIGHTS.client_quality, details };
}

function scoreBudgetFit(
  job: AnalyzeJobInput['job'],
  myRate: number
): { score: number; max: number; details: string[]; estimated_value: string; recommendation: string } {
  const details: string[] = [];
  let score = 0;
  let estimated_value = 'Unknown';
  let recommendation = '';

  const budgetText = (job.budget ?? '').toLowerCase();
  const jobType = (job.job_type ?? '').toLowerCase();
  const duration = (job.duration ?? '').toLowerCase();

  // Try to parse budget
  const numbers = (job.budget ?? '').match(/[\d,]+\.?\d*/g);
  const amounts = numbers ? numbers.map((n) => parseFloat(n.replace(',', ''))) : [];

  if (amounts.length > 0) {
    const minBudget = Math.min(...amounts);
    const maxBudget = Math.max(...amounts);
    const avgBudget = (minBudget + maxBudget) / 2;

    if (jobType.includes('hourly') || budgetText.includes('/hr') || budgetText.includes('hour')) {
      // Hourly job
      if (avgBudget >= myRate) {
        score = WEIGHTS.budget_fit;
        details.push(`Hourly rate ${avgBudget >= myRate * 1.2 ? 'above' : 'matches'} your target ($${myRate}/hr)`);
        recommendation = avgBudget >= myRate * 1.5
          ? `Bid at $${myRate + 5}/hr — client is paying well`
          : `Bid at $${myRate}/hr`;
      } else {
        score = Math.floor(WEIGHTS.budget_fit * (avgBudget / myRate));
        details.push(`Rate below target: budget $${avgBudget}/hr vs your $${myRate}/hr`);
        recommendation = `Consider $${Math.floor(avgBudget * 0.9)}/hr to stay competitive`;
      }

      // Estimate total value based on duration
      let hours = 40; // default
      if (duration.includes('month') || duration.includes('ongoing')) hours = 160;
      else if (duration.includes('week')) hours = 40;
      else if (duration.includes('day')) hours = 8;
      estimated_value = `~$${(avgBudget * hours).toLocaleString()} (${hours}h at $${avgBudget}/hr)`;
    } else {
      // Fixed price
      estimated_value = `$${minBudget === maxBudget ? minBudget : `${minBudget}–${maxBudget}`}`;
      const equivalentHours = avgBudget / myRate;

      if (avgBudget >= myRate * 8) {
        score = WEIGHTS.budget_fit;
        details.push(`Fixed budget $${avgBudget} = ~${equivalentHours.toFixed(0)}h at your rate`);
        recommendation = `Bid $${avgBudget} or slightly higher if scope is clear`;
      } else if (avgBudget >= myRate * 4) {
        score = Math.floor(WEIGHTS.budget_fit * 0.7);
        details.push(`Moderate budget: $${avgBudget}`);
        recommendation = `Bid $${avgBudget} — manageable scope`;
      } else {
        score = Math.floor(WEIGHTS.budget_fit * 0.3);
        details.push(`Low budget: $${avgBudget} — only ${equivalentHours.toFixed(1)}h at your rate`);
        recommendation = `Skip or counter-propose $${myRate * 8}`;
      }
    }
  } else {
    score = 8; // Unknown budget — neutral score
    details.push('Budget not specified — negotiate based on scope');
    recommendation = `Open with $${myRate}/hr or a scoped fixed price`;
  }

  return { score: Math.min(score, WEIGHTS.budget_fit), max: WEIGHTS.budget_fit, details, estimated_value, recommendation };
}

function scoreCompetition(proposals_count: string): {
  score: number;
  max: number;
  details: string;
} {
  const text = proposals_count.toLowerCase();

  if (text.includes('less than 5') || text.includes('0-5') || text === '') {
    return { score: WEIGHTS.competition, max: WEIGHTS.competition, details: 'Very low competition (<5 proposals) — apply ASAP!' };
  }
  if (text.includes('5-10') || text.includes('5 to 10')) {
    return { score: 8, max: WEIGHTS.competition, details: 'Low competition (5-10 proposals)' };
  }
  if (text.includes('10-15') || text.includes('15-20')) {
    return { score: 5, max: WEIGHTS.competition, details: 'Moderate competition (10-20 proposals)' };
  }
  if (text.includes('20-50') || text.includes('50')) {
    return { score: 2, max: WEIGHTS.competition, details: 'High competition (20-50+ proposals)' };
  }
  return { score: 7, max: WEIGHTS.competition, details: `Proposals: ${proposals_count}` };
}

function scoreProjectClarity(job: AnalyzeJobInput['job']): {
  score: number;
  max: number;
  details: string[];
} {
  const details: string[] = [];
  let score = 0;

  const descLength = job.description.length;
  if (descLength > 500) { score += 4; details.push('Detailed description (500+ chars)'); }
  else if (descLength > 200) { score += 2; details.push('Moderate description'); }
  else { details.push('Vague description — ask clarifying questions'); }

  if ((job.skills ?? []).length >= 3) { score += 3; details.push('Clear skill requirements'); }
  if (job.budget && job.budget !== '') { score += 2; details.push('Budget specified'); }
  if ((job.screening_questions ?? []).length > 0) {
    score += 1;
    details.push(`${job.screening_questions!.length} screening question(s) — client is selective`);
  }

  return { score: Math.min(score, WEIGHTS.project_clarity), max: WEIGHTS.project_clarity, details };
}

function detectRedFlags(job: AnalyzeJobInput['job']): {
  count: number;
  flags: string[];
} {
  const text = `${job.title} ${job.description}`.toLowerCase();
  const flags: string[] = [];

  RED_FLAG_KEYWORDS.forEach((kw) => {
    if (text.includes(kw.toLowerCase())) {
      flags.push(`"${kw}"`);
    }
  });

  // Structural red flags
  if (job.description.length < 100) flags.push('Description too short — poorly defined scope');
  if (!job.client?.rating && !job.client?.total_spent) flags.push('No client history — payment risk');
  if ((job.client?.hire_rate ?? '').includes('0%')) flags.push('0% hire rate — window shopper');

  return { count: flags.length, flags };
}

// ─── Main analysis function ────────────────────────────────────────────────────

export interface JobAnalysis {
  job_title: string;
  job_url: string;
  // Scores
  total_score: number;
  max_score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  recommendation: 'APPLY NOW' | 'APPLY' | 'CONSIDER' | 'SKIP' | 'AVOID';
  // Breakdown
  breakdown: {
    niche_fit: { score: number; max: number; details: string[] };
    client_quality: { score: number; max: number; details: string[] };
    budget_fit: { score: number; max: number; details: string[]; estimated_value: string };
    competition: { score: number; max: number; details: string };
    project_clarity: { score: number; max: number; details: string[] };
    red_flags: { count: number; penalty: number; flags: string[] };
  };
  // Actionable output
  suggested_bid: string;
  estimated_project_value: string;
  key_selling_points: string[];
  proposal_tips: string[];
  risk_factors: string[];
}

export async function analyzeJob(input: AnalyzeJobInput): Promise<JobAnalysis> {
  const myRate = input.my_rate ?? config.bid.default;
  const job = input.job;

  // Run all scorers
  const nicheFit = scoreNicheFit(job);
  const clientQuality = scoreClientQuality(job.client);
  const budgetFit = scoreBudgetFit(job, myRate);
  const competition = scoreCompetition(job.proposals_count ?? '');
  const projectClarity = scoreProjectClarity(job);
  const redFlags = detectRedFlags(job);

  const rawScore =
    nicheFit.score +
    clientQuality.score +
    budgetFit.score +
    competition.score +
    projectClarity.score;

  const penalty = redFlags.count * Math.abs(WEIGHTS.red_flags);
  const totalScore = Math.max(0, rawScore - penalty);
  const maxScore = WEIGHTS.niche_fit + WEIGHTS.client_quality + WEIGHTS.budget_fit + WEIGHTS.competition + WEIGHTS.project_clarity;
  const pct = (totalScore / maxScore) * 100;

  // Grade
  let grade: JobAnalysis['grade'];
  if (pct >= 90) grade = 'A+';
  else if (pct >= 75) grade = 'A';
  else if (pct >= 60) grade = 'B';
  else if (pct >= 45) grade = 'C';
  else if (pct >= 30) grade = 'D';
  else grade = 'F';

  // Recommendation
  let recommendation: JobAnalysis['recommendation'];
  if (pct >= 80 && redFlags.count === 0) recommendation = 'APPLY NOW';
  else if (pct >= 65) recommendation = 'APPLY';
  else if (pct >= 45) recommendation = 'CONSIDER';
  else if (pct >= 30) recommendation = 'SKIP';
  else recommendation = 'AVOID';

  // Key selling points for this specific job
  const keySellingPoints: string[] = [];
  const text = job.description.toLowerCase();

  if (text.includes('n8n')) keySellingPoints.push('Direct n8n experience — mention specific nodes/workflows');
  if (text.includes('webhook')) keySellingPoints.push('Webhook expertise — show real-time integration examples');
  if (text.includes('api')) keySellingPoints.push('API integration — reference similar REST/GraphQL projects');
  if (text.includes('crm') || text.includes('hubspot') || text.includes('salesforce'))
    keySellingPoints.push('CRM automation — mention lead/deal workflow experience');
  if (text.includes('slack') || text.includes('discord'))
    keySellingPoints.push('Messaging platform automation — notification workflows');
  if (text.includes('google sheet') || text.includes('airtable'))
    keySellingPoints.push('Spreadsheet automation — data sync/reporting workflows');
  if (keySellingPoints.length === 0)
    keySellingPoints.push('Highlight n8n as the right tool for their automation needs');

  // Proposal tips
  const proposalTips: string[] = [
    "Open with THEIR problem, not your bio",
    `Mention ${(job.skills ?? []).slice(0, 3).join(', ') || 'their specific tools'} directly`,
  ];
  if ((job.screening_questions ?? []).length > 0) {
    proposalTips.push(`Answer all ${job.screening_questions!.length} screening questions thoughtfully`);
  }
  if (pct >= 65) proposalTips.push('Include a brief workflow diagram or approach outline');
  if (competition.score < 5) proposalTips.push('High competition — make your opener unique and specific');

  return {
    job_title: job.title,
    job_url: job.url ?? '',
    total_score: totalScore,
    max_score: maxScore,
    grade,
    recommendation,
    breakdown: {
      niche_fit: nicheFit,
      client_quality: clientQuality,
      budget_fit: {
        score: budgetFit.score,
        max: budgetFit.max,
        details: budgetFit.details,
        estimated_value: budgetFit.estimated_value,
      },
      competition,
      project_clarity: projectClarity,
      red_flags: {
        count: redFlags.count,
        penalty,
        flags: redFlags.flags,
      },
    },
    suggested_bid: budgetFit.recommendation,
    estimated_project_value: budgetFit.estimated_value,
    key_selling_points: keySellingPoints,
    proposal_tips: proposalTips,
    risk_factors: redFlags.flags,
  };
}
