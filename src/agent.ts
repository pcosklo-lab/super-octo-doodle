import Anthropic from '@anthropic-ai/sdk';
import type { ScrapeResult, AnalysisResult, AgentOptions } from './types';

const DEFAULT_OPTIONS: Required<AgentOptions> = {
  model: 'claude-sonnet-4-6',
  maxTokens: 8192,
};

const SYSTEM_PROMPT = `You are a market research analyst specializing in e-commerce and digital product markets.
You have been given scraped data from Etsy's digital products search results.
Your task is to produce a comprehensive, actionable Markdown report.

CRITICAL OUTPUT REQUIREMENTS:
- Output ONLY valid Markdown, starting with a # heading
- Use tables for data comparisons (GitHub Markdown syntax)
- Use numbered lists for rankings
- Do not include any preamble like "Here is the report:" — start directly with the # heading
- All monetary values in USD unless specified
- When data is limited (e.g., sales counts not available), note this clearly rather than extrapolating
- Be specific and data-driven; cite numbers from the dataset`;

function buildUserPrompt(result: ScrapeResult): string {
  const date = new Date(result.scrapedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `Analyze the following Etsy digital products data scraped on ${date}.

## Scrape Summary
- Total products: ${result.totalScraped}
- Pages scraped: ${result.pagesScraped}
- Scrape errors: ${result.errors.length}
- Timestamp: ${result.scrapedAt}

## Product Data (JSON)
${JSON.stringify(result.products, null, 2)}

## Report Requirements
Generate a Markdown report with these sections IN ORDER:

1. **# Etsy Digital Products Market Report** — include the date and a note that data comes from ${result.totalScraped} scraped listings

2. **## Executive Summary** — 3–4 bullet points with the most important market insights (price sweet spots, dominant product types, engagement patterns)

3. **## Top 10 Products by Engagement** — table with columns: Rank | Title | Seller | Price | Reviews | Sales (use "N/A" if sales data unavailable). Sort by review count descending.

4. **## Price Analysis** — table showing distribution across ranges: Under $2 | $2–$5 | $5–$10 | $10–$20 | Over $20 (count + % of total + avg reviews per range). Identify the price sweet spot with reasoning.

5. **## Product Categories & Winning Themes** — what types of digital products dominate (planners, printables, templates, SVGs, etc.), common keywords in top-performing titles, seasonal or evergreen patterns

6. **## Seller Insights** — top sellers by number of products in this dataset, observations about multi-product strategies and niche specialization

7. **## Actionable Recommendations** — 6–8 specific, numbered recommendations for someone wanting to launch their own digital products on Etsy. Be concrete (e.g., specific price points, product formats, title keywords).

8. **## Data Notes** — scrape timestamp, what data was and wasn't available (e.g., sales counts), limitations of this snapshot as market intelligence`;
}

function extractExecutiveSummary(markdown: string): string {
  const match = markdown.match(/## Executive Summary\n([\s\S]*?)(?=\n## )/);
  return match?.[1]?.trim() ?? 'See full report for details.';
}

export async function analyzeWithClaude(
  scrapeResult: ScrapeResult,
  options: AgentOptions = {}
): Promise<AnalysisResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const message = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildUserPrompt(scrapeResult),
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== 'text') {
    throw new Error(`Unexpected response type from Claude: ${content.type}`);
  }

  const markdownReport = content.text;
  const executiveSummary = extractExecutiveSummary(markdownReport);

  return { markdownReport, executiveSummary };
}
