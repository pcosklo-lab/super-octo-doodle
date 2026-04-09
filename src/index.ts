import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import chalk from 'chalk';
import ora from 'ora';
import { scrapeEtsyDigitalProducts } from './scraper';
import { analyzeWithClaude } from './agent';

dotenv.config();

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(chalk.red('\nError: ANTHROPIC_API_KEY environment variable is required'));
    console.error(chalk.yellow('  Copy .env.example to .env and add your Anthropic API key\n'));
    process.exit(1);
  }

  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  console.log(chalk.bold.blue('\n  Etsy Digital Products Scraper + AI Analyst\n'));

  // Phase 1: Scrape
  const scrapeSpinner = ora('Starting Etsy scraper...').start();

  let scrapeResult;
  try {
    scrapeResult = await scrapeEtsyDigitalProducts(
      { pages: 4, delayMin: 1000, delayMax: 3000, headless: true },
      (progress) => {
        scrapeSpinner.text = chalk.cyan(
          `Scraping page ${progress.currentPage}/${progress.totalPages}` +
            ` — ${progress.productsFound} products found so far...`
        );
      }
    );
    scrapeSpinner.succeed(
      chalk.green(
        `Scraped ${scrapeResult.totalScraped} products across ${scrapeResult.pagesScraped} pages`
      )
    );
    if (scrapeResult.errors.length > 0) {
      console.warn(
        chalk.yellow(`  Warning: ${scrapeResult.errors.length} page(s) had errors`)
      );
    }
  } catch (err) {
    scrapeSpinner.fail(chalk.red('Scraping failed'));
    console.error(chalk.red(String(err)));
    process.exit(1);
  }

  // Phase 2: AI Analysis
  const analysisSpinner = ora(
    'Analyzing with Claude AI (this may take 30–60 seconds)...'
  ).start();

  let analysisResult;
  try {
    analysisResult = await analyzeWithClaude(scrapeResult, {
      model: 'claude-sonnet-4-6',
      maxTokens: 8192,
    });
    analysisSpinner.succeed(chalk.green('AI analysis complete'));
  } catch (err) {
    analysisSpinner.fail(chalk.red('Claude analysis failed'));
    console.error(chalk.red(String(err)));
    process.exit(1);
  }

  // Phase 3: Write report
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  const reportPath = path.join(reportsDir, `etsy-report-${timestamp}.md`);
  fs.writeFileSync(reportPath, analysisResult.markdownReport, 'utf-8');

  // Phase 4: Console summary
  console.log('\n' + chalk.bold.white('Executive Summary:'));
  console.log(chalk.gray(analysisResult.executiveSummary));
  console.log(
    '\n' + chalk.bold.green('Report saved to: ') + chalk.underline(reportPath)
  );
  console.log(chalk.gray(`Products analyzed: ${scrapeResult.totalScraped}\n`));
}

main().catch((err) => {
  console.error(chalk.red('\nFatal error:'), err);
  process.exit(1);
});
